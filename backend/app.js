//this line will allow frontend visit backend
const cors = require('cors');
app.use(cors());

//This line uses the require function to include the express module.
var express = require('express');
//This line creates an instance called app in the express application.
var app = express();

//This line uses the require function to include the express-session module.
var session = require('express-session');

//This line contains the configuration to connect the database.
var conn = require('./dbConfig');
//var bodyParser = require('body-parser');

//This line sets up the express application to use 'EJS' as the view engine.
//app.set('view engine','ejs');

const QRCode = require('qrcode');

//This line sets mail server
const nodemailer = require('nodemailer');

// This line sets the environment variables 
const multer = require('multer');
const path = require('path');
const fs = require('fs');

require('./imageCleaner');

// 设置存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/images/uploads/'); 
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

//This will set up the express application to include the session middleware.
app.use(session({
  secret: 'yoursecret',           // 用于签名 cookie
  resave: false,                  // 避免重复保存 session
  saveUninitialized: false,       // 避免存储空 session
}));

//This line will set 全局变量
app.use((req, res, next) => {
    res.locals.s_username = req.session.username || null;
    res.locals.s_role = req.session.role || null;

    res.locals.s_orderId = req.session.orderId || 0;
    res.locals.s_totalNumber = req.session.totalNumber || 0;
    res.locals.s_totalMoney = req.session.totalMoney || 0;
    res.locals.s_tableNumber = req.session.tableNumber || 0;

    res.locals.s_completed = req.session.completed || 15;
    res.locals.s_ready = req.session.ready || 14;
    res.locals.s_cancelled = req.session.cancelled || 17;
    res.locals.s_pending = req.session.pending || 11;
    res.locals.s_preparing = req.session.preparing || 13;
    res.locals.s_confirmed = req.session.confirmed || 12;

    next();
});

//These lines will ensure that the express application can handle both JSON and URL-encoded data.
app.use(express.json());
app.use(express.urlencoded({extended: true}));

//This line will check for any request with a URL path starting with '/public'.
app.use(express.static('public'));
app.use('/public', express.static('public'));
app.use('/uploads', express.static(__dirname + '/public/images/uploads'));
app.use('/QRCodes', express.static(__dirname + '/public/images/QRCodes'));


//convert time zone
function toLocalDatetimeString(utcInput) {
  if (typeof utcInput === 'string') {
    // 处理无 Z 的数据库字符串
    if (!utcInput.includes('T')) {
      utcInput = utcInput.replace(' ', 'T') + 'Z';
    }
  }
  const date = new Date(utcInput);
  return date.toLocaleString('sv-SE'); // 24小时制
}

app.get('/api/', function (req, res) {
    const topN = 3;
    conn.query('CALL SelectTopItemsByType(?)', [topN], function (error, results) {
        if (error) {
            return res.status(500).json({ success: false, error:'Database error (SelectTopItemsByType)'});
        }

        res.json({
            success: true,
            topNItemsPerType: results[0],
            topN: topN
        });
    });
});

// app.get('/api/login', function (req, res) {
//     
// });

// app.get('/api/contact', function (req, res) {
//    
// });

// app.get('/api/resetpwd', function (req, res) {
//     
// });

app.get('/api/ordersForHistory', function (req, res) {
    const startTime = new Date(req.query.fromDate);
    const endTime = new Date(req.query.toDate);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return res.json({
                    success: true,
                    orders: [],
                    items: [],
                    queried: false
                });
    }

    conn.query('SELECT * FROM orders_info where ordertime >= ? and ordertime <= ? order by ordertime, tablenumber, id ASC', 
        [startTime, endTime], function (error, results) {
            if (error) {
                return res.status(500).json({ success: false, error:'Database error (orders_info)', error});
            }

            results.forEach(element => {
                element.ordertime = toLocalDatetimeString(element.ordertime);
                element.finishtime = toLocalDatetimeString(element.finishtime);
            });

            const orderIds = results.map(order => order.id);
            if (orderIds.length === 0) {
                // No orders — skip second query
                return res.json({
                    success: true,
                    orders: [],
                    items: [],
                    queried: true
                });
            }
            else {
                conn.query('SELECT * FROM order_items_info where orderid in (?)',
                    [orderIds], function (error2, results2) {
                        if (error2) {
                            return res.json(500).json({ success: false, error:'Database error (order_items)'});
                        }

                        res.json({
                            success: true,
                            orders: results,
                            items: results2,
                            queried: true
                        });
                    });
            }
    });
});

app.get('/api/filterByDate', function (req, res) {
    const startTime = new Date(req.query.fromDate);
    const endTime = new Date(req.query.toDate);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return res.status(500).json({ success: false, error:"Invalid date"});
    }
    else {
        res.json({
            success: true,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate
        });
    }
});

app.get('/api/pendingOrderCount', function (req, res) {
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    conn.query('SELECT COUNT(*) as count FROM orders_info where ordertime >= ? and ordertime <= ? and status = ?',
        [startTime, endTime, res.locals.s_confirmed], function (error, results) {
            if (error) return res.status(500).json({ success: false, error: 'Database error' });
            res.json({ 
                success: true,
                count: results[0].count 
            });
        }
    );
});

app.get('/api/ordersForToday', function (req, res) {
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    conn.query('SELECT * FROM orders_info where ordertime >= ? and ordertime <= ? order by (status = 12) DESC, status, tablenumber, id ASC', 
        [startTime, endTime], function (error, results) {
            if (error) {
                return res.status(500).json({ success: false, error:'Database error (orders_info)', error});
            }

            results.forEach(element => {
                //console.log('before:', element.ordertime, element.finishtime);
                element.ordertime = toLocalDatetimeString(element.ordertime);
                element.finishtime = toLocalDatetimeString(element.finishtime);
                //console.log('after:', element.ordertime, element.finishtime);
            });

            const orderIds = results.map(order => order.id);
            if (orderIds.length === 0) {
                // No orders — skip second query
                return res.json({
                    success: true,
                    orders: [],
                    items: []
                });
            }
            else {
                conn.query('SELECT * FROM order_items_info where orderid in (?)',
                    [orderIds], function (error2, results2) {
                        if (error2) {
                            return res.status(500).json({ 
                                    success: false,
                                    error:'Database error (order_items)'
                                });
                        }

                        res.json({
                            success: true,
                            orders: results,
                            items: results2
                        });
                });
            }
    });
});

app.get('/api/allAccounts', function (req, res) {
    conn.query('SELECT * FROM users_info', function (error, results) {
        if (error) {
            return res.status(500).json({ success: false, error:'Database error (users_info)'});
        }

        conn.query('SELECT * FROM user_type', function (error2, results2) {
            if (error2) {
                return res.status(500).json({ success: false, error:'Database error (user_type)'});
            }

            res.json({
                success: true,
                users: results,
                usertypes: results2,
                addSuccess: req.query.addSuccess,
                deleteSuccess: req.query.deleteSuccess
            });
        });
    });
});

app.get('/api/payment', function (req, res) {
    res.json({
        success: req.query.success
    });
});

app.get('/api/customizeFoodtype', function (req, res) {
    conn.query('SELECT * FROM food_type order by showorder ASC', function (error, results) {
        if (error) {
            return res.status(500).json({ success: false, error:'Database error (food_type)'});
        }

        res.json({
            success: true,
            foodtypes: results,
            addSuccess: req.query.addSuccess,
            updateSuccess: req.query.updateSuccess,
            deleteSuccess: req.query.deleteSuccess
        });
    });
});

app.get('/api/qrcode', function (req, res) {
    conn.query('SELECT * FROM qrcode order by tablenumber ASC', function (error, results) {
        if (error) {
            return res.status(500).json({ success: false, error:'Database error (qrcode)'});
        }

        res.json({
                success: true,
                qrcodes: results
        });
    });
});

app.get('/api/cart', function (req, res) {
    conn.query('SELECT * FROM order_items_info WHERE orderid = ?', [res.locals.s_orderId], function (error, results) {
        if (error) {
            return res.status(500).json({ success: false, error:'Database error (order_items_info)'});
        }

        conn.query('SELECT * FROM orders_info WHERE id = ?', [res.locals.s_orderId], function (error2, results2) {
            if (error2) {
                return res.status(500).json({ success: false, error:'Database error (orders_info)'});
            }

            if (results2.length > 0) {
                res.json({
                    success: true,
                    orderItems: results,
                    orderStatus: results2[0].statusname
                });
            }
            else {
                res.json({
                    success: true,
                    orderItems: [],
                    orderStatus: ''
                });
            }
        });
    });
});

function renderOverviewMenu(req, res) {
    conn.query('SELECT * FROM menu_info where itemAvailable = 1 ORDER BY foodtype ASC', function (error, menuResults) {
        if (error) {
            return res.status(500).json({ success: false, error:'Database error (menu_info)'});
        }


        conn.query('SELECT * FROM food_type WHERE available = 1 ORDER BY showorder', function (error2, foodTypeResults) {
            if (error2) {
                return res.status(500).json({ success: false, error:'Database error (food_type)'});
            }

            if (String(res.locals.s_orderId) !== '0') {
                conn.query('SELECT SUM(price * itemnumber * (100 - discount) / 100) AS total_price, SUM(itemnumber) AS total_number FROM order_items WHERE orderid = ? and status < ?',
                    [res.locals.s_orderId, res.locals.s_completed], function (error3, statisticsResults) {
                        if (error3) {
                            return res.status(500).json({ success: false, error:'Database error (statisticsResults)'});
                        }
                        else if (statisticsResults.length > 0) {
                            res.locals.s_totalNumber = req.session.totalNumber = statisticsResults[0].total_number || 0;
                            res.locals.s_totalMoney = req.session.totalMoney = statisticsResults[0].total_price || 0;
                            res.json({
                                success: true,
                                menu: menuResults,
                                foodtypes: foodTypeResults
                            });
                        }
                });
            }
            else{
                res.locals.s_totalNumber = req.session.totalNumber = 0;
                res.locals.s_totalMoney = req.session.totalMoney = 0;
                res.json({
                    success: true,
                    menu: menuResults,
                    foodtypes: foodTypeResults
                });
            }
        });
    });
}

app.get('/api/overviewMenu', renderOverviewMenu);


// GET /table/8
app.get('/api/table/:table', (req, res) => {
    const tableNumber = parseInt(req.params.table);
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (isNaN(tableNumber)) {
        return res.status(400).json({ success: false, error: 'Invalid tableNumber' });
    }

    req.session.loggedin = true;
    res.locals.s_role = req.session.role = 'Customer';

    conn.query("Select * from order_status", (err, result) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false, error:'Failed to save new items to database.'});
        } else if (result.length > 1) {
            result.forEach(element => {
                switch (element.status) {
                    case 'pending':
                        res.locals.s_pending = req.session.pending = element.id;
                        break;
                    case 'confirmed':
                        res.locals.s_confirmed = req.session.confirmed = element.id;
                        break;
                    case 'preparing':
                        res.locals.s_preparing = req.session.preparing = element.id;
                        break;
                    case 'ready':
                        res.locals.s_ready = req.session.ready = element.id;
                        break;
                    case 'completed':
                        res.locals.s_completed = req.session.completed = element.id;
                        break;
                    case 'cancelled':
                        res.locals.s_cancelled = req.session.cancelled = element.id;
                        break;
                    default:
                        break;
                }
            });

            //check whether the customer has existed
            const query = 'SELECT * FROM orders WHERE tablenumber = ? and status < ? and ordertime >= ?';
            conn.query(query, [tableNumber, res.locals.s_completed, startTime], function (err, results) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, error:'Database error'});
                }
                else if (results.length > 0) {
                    //log in again or more than two people login
                    res.locals.s_username = req.session.username = results[0].creator;

                    res.locals.s_orderId = req.session.orderId = results[0].id;
                    res.locals.s_tableNumber = req.session.tableNumber = results[0].tablenumber;

                    console.log('A new Customer:', res.locals.s_username, 'is logging in again. orderId=', 
                        res.locals.s_orderId, 'tableNumber=', res.locals.s_tableNumber);

                    // 调用封装好的函数
                    renderOverviewMenu(req, res);
                }
                else {
                    //New customer
                    res.locals.s_username = req.session.username = Date.now().toString() + Math.floor(Math.random() * 1000);

                    res.locals.s_orderId = req.session.orderId = 0;
                    res.locals.s_tableNumber = req.session.tableNumber = tableNumber;

                    console.log('A new Customer', res.locals.s_username, 'is logging in.');

                    // 调用封装好的函数
                    renderOverviewMenu(req, res);
                }
            });
        }
        else{
            console.error('Database error:', err);
            return res.status(500).json({ success: false, error:'Failed to get status.'});
        }
    });
});

// GET /menuItems?categoryId=123
app.get('/api/menuItems', function (req, res) {
    const categoryId = parseInt(req.query.categoryId);

    if (isNaN(categoryId)) {
        return res.status(400).json({ success: false, error: 'Invalid categoryId' });
    }

    const query = 'SELECT * FROM menu_info WHERE foodtype = ?';

    conn.query(query, [categoryId], function (err, results) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        res.json({ success: true, items: results }); // 返回JSON格式给前端
    });
});

app.get('/api/customizeMenu', function (req, res) {
    conn.query('SELECT * FROM food_type  where available = 1 order by showOrder ASC', function (error, results) {
        if (error) {
            return res.status(500).json({ success: false, error:'Database error (food_type)'});
        }

        let foodTypeId = null;
        if (results.length > 0) {
            foodTypeId = req.query.foodTypeId ? parseInt(req.query.foodTypeId) : results[0].id;
        }

        res.json({
            success: true,
            foodtypes: results,
            foodTypeId: foodTypeId
        });
    });
});


app.get('/api/updateAccount', function (req, res) {
    if (res.locals.s_username) {
        conn.query('SELECT * FROM users WHERE username = ?', [res.locals.s_username],
            function (error, results) {
                if (error) {
                    res.status(500).json({ success: false, error:'Database error'});
                } else if (results.length === 0) {
                    res.json({ success: false, error:'User not found'});
                } else {
                    const user = results[0];
                    res.json({
                        id: user.id,
                        username: user.username,
                        password: user.password,
                        firstname: user.firstname,
                        lastname: user.lastname,
                        phone: user.phone,
                        email: user.email,
                        success: req.query.success
                    });
                }
            });
    } else {
        res.json({ success: false, error:'Please login first!'});
    }
});

function resetCurrentTableInfo(req,res) {
    res.locals.s_orderId = req.session.orderId = 0;
    res.locals.s_tableNumber = req.session.tableNumber = 0;
    res.locals.s_totalNumber = req.session.totalNumber = 0;
    res.locals.s_totalMoney = req.session.totalMoney = 0;

    console.log('Reset cur table info');
}

//This will be used to return to home page after the members logout.
app.get('/api/logout',(req,res) => {
	console.log("Log out")
    
    res.locals.s_username = null;
    res.locals.s_role = null;

    resetCurrentTableInfo(req, res);

    req.session.destroy();
    
	res.json({ success: true });
});

function sendStatistics(req, res) {
    conn.query('SELECT SUM(price * itemnumber * (100 - discount) / 100) AS total_price, SUM(itemnumber) AS total_number FROM order_items WHERE orderid = ? and status = ?',
        [res.locals.s_orderId, res.locals.s_pending], function (error, results) {
            if (error) {
                return res.status(500).json({ success: false, error:'Failed to calculate statistics.'});
            }

            if (results.length > 0) {
                res.locals.s_totalMoney = req.session.totalMoney = results[0].total_price || 0;
                res.locals.s_totalNumber = req.session.totalNumber = results[0].total_number || 0;
                res.json({
                    success: true,
                    totalMoney: res.locals.s_totalMoney,
                    totalNumber: res.locals.s_totalNumber
                });
            } else {
                 res.json({
                    success: false,
                    totalMoney: 0,
                    totalNumber: 0
                });
            }
        });
}

function addItem2Databse(req, res) {
    const itemId = req.body.itemId;
    const itemName = req.body.itemName;
    const price = parseFloat(req.body.price);
    const discount = parseInt(req.body.discount);
    let itemNumber = parseInt(req.body.itemNumber);
    const orderTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'

    const sql = 'UPDATE orders SET status = ? where id = ?';
    conn.query(sql, [res.locals.s_pending, res.locals.s_orderId], (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update database.' });
        } 
    
        conn.query('SELECT * from order_items where orderid = ? and itemid = ? and status = ?',
            [res.locals.s_orderId, itemId, res.locals.s_pending], (err, result) => {
                if (err) {
                    return res.status(500).json({ success: false, error:'Failed to save new items to database.'});
                } else if (result.length > 0) {
                    itemNumber += result[0].itemnumber;
                    const orderItemId = result[0].id;

                    // 也可以直接更新
                    const updateSQL = 'UPDATE order_items SET itemnumber = ? WHERE id = ? ';
                    conn.query(updateSQL, [itemNumber, orderItemId], (err2, result2) => {
                        if (err2) {
                            return res.status(500).json({ success: false, error:'Failed to update item.'});
                        }

                        return sendStatistics(req, res);
                    });
                } else {
                    // 没有原来项，直接插入
                    const insertSQL = 'INSERT INTO order_items (itemid, itemname, price, discount, itemnumber, orderid, status) VALUES (?, ?, ?, ?, ?, ?, ?)';
                    conn.query(insertSQL, [itemId, itemName, price, discount, itemNumber, res.locals.s_orderId, res.locals.s_pending], (err3, result3) => {
                        if (err3) {
                            return res.status(500).json({ success: false, error:'Failed to insert item.'});
                        }

                        return sendStatistics(req, res);
                    });
                }
        });
    });
}

app.post('/api/pay', function (req, res) {
    const orderId = res.locals.s_orderId;
    const finishtime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'

    if (isNaN(orderId)) {
        return res.status(500).json({success: false, error: 'Invalid orderId'});
    }

    const sql = 'UPDATE orders SET status = ?, finishtime = ? where id = ?';
    conn.query(sql, [res.locals.s_completed, finishtime, orderId], (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update database.' });
        } else {
            resetCurrentTableInfo(req, res);

            res.json({ success: true });
        }
    });
});

app.post('/api/placeOrder', function (req, res) {
    const orderId = parseInt(req.body.orderId);

    if (isNaN(orderId)) {
        return res.status(500).json({success: false, error: 'Invalid orderId'});
    }

    const sql = 'UPDATE orders SET status = ? where id = ?';
    conn.query(sql, [res.locals.s_confirmed, orderId], (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update database.' });
        } else {
            res.json({ success: true });
        }
    });
});

app.post('/api/receiveOrder', function (req, res) {
    const orderId = parseInt(req.body.orderId);

    if (isNaN(orderId)) {
        return res.status(500).json({success: false, error: 'Invalid orderId'});
    }

    const sql = 'UPDATE orders SET status = ? where id = ?';
    conn.query(sql, [res.locals.s_preparing, orderId], (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update database.' });
        } else {
            res.json({ success: true });
        }
    });
});

app.post('/api/finishOrder', function (req, res) {
    const orderId = parseInt(req.body.orderId);
    const finishtime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'

    if (isNaN(orderId)) {
        return res.status(500).json({success: false, error: 'Invalid orderId'});
    }

    const sql = 'UPDATE orders SET status = ?, finishtime = ? where id = ?';
    conn.query(sql, [res.locals.s_completed, finishtime, orderId], (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update database.' });
        } else {

            if( res.locals.s_orderId === orderId ) {
                resetCurrentTableInfo(req, res);
            }

            res.json({ success: true });
        }
    });
});

app.post('/api/cancelOrder', function (req, res) {
    const orderId = parseInt(req.body.orderId);
    const finishtime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'

    if (isNaN(orderId)) {
        return res.status(500).json({success: false, error: 'Invalid orderId'});
    }

    const sql = 'UPDATE orders SET status = ?, finishtime = ? where id = ?';
    conn.query(sql, [res.locals.s_cancelled, finishtime, orderId], (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, error: 'Failed to update database.' });
        } else {
            if (res.locals.s_orderId === orderId) {
                resetCurrentTableInfo(req, res);
            }

            res.json({ success: true });
        }
    });
});


app.post('/api/deleteOrder', function (req, res) {
    const orderId = parseInt(req.body.orderId);

    if (isNaN(orderId)) {
        return res.status(500).json({success: false, error: 'Invalid orderId'});
    }

    const sql = 'DELETE from orders where id = ?';
    conn.query(sql, [orderId], (err, result) => {
        if (err) {
            console.error('Database delete error:', err);
            return res.status(500).json({ success: false, error: 'Failed to delete database.' });
        } else {
            if (res.locals.s_orderId === orderId) {
                resetCurrentTableInfo(req, res);
            }

            res.json({ success: true });
        }
    });
});


//Add items into order
app.post('/api/addItems', function (req, res) {
    const orderTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    const tableNumber = parseInt(req.body.tableNumber);

    console.log('addItems:', orderTime);

    //if tableNumber is not null, this order is made by recepitonist
    if (!isNaN(tableNumber)) {
        res.locals.s_tableNumber = req.session.tableNumber = tableNumber;
    }

    if (res.locals.s_orderId) {
        addItem2Databse(req, res);
    }
    else {
        //create a new order
        const sql = 'INSERT INTO orders (creator, ordertime, tablenumber, status) VALUES (?, ?, ?, ?)';
        conn.query(sql, [res.locals.s_username, orderTime, res.locals.s_tableNumber, res.locals.s_pending], (err, result) => {
            if (err) {
                console.error('Database insert error:', err);
                return res.status(500).json({success: false, error: 'Failed to save a new order to database.'});
            } else {
                res.locals.s_orderId = req.session.orderId = result.insertId;

                addItem2Databse(req, res);
            }
        });
    }
});

app.post('/api/ReadyItem', function (req, res) {
    const itemId = parseInt(req.body.itemId);
    const orderId = parseInt(req.body.orderId);

    if (isNaN(itemId) || isNaN(orderId)) {
        return res.status(400).json({
                success: false,
                error: 'Invalid itemId or orderId'});
    }

    conn.query('update order_items SET status = ? WHERE id = ?', [res.locals.s_ready, itemId], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                success: false,
                error: 'Database error (order_items)'});
        }

        conn.query('SELECT * FROM order_items_info WHERE orderid = ?', [orderId], function (error, results) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    error: 'Database error (order_items_info)'
                });
            }

            const newStatus = caculateStatus(results, res);
            conn.query('update orders SET status = ? WHERE id = ?', [newStatus, orderId], function (err, result) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        success: false,
                        error: 'Database error (orders)'
                    });
                }

                res.json({ success: true });
            });
        });
    });
});

app.post('/api/deleteItemByR', function (req, res) {
    const itemId = parseInt(req.body.itemId);
    const orderId = parseInt(req.body.orderId);

    if (isNaN(itemId) || isNaN(orderId)) {
        return res.status(400).json({
                success: false,
                error: 'Invalid itemId or orderId'});
    }

    conn.query('delete from order_items WHERE id = ?', [itemId], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                success: false,
                error: 'Database error (order_items)'});
        }

        conn.query('SELECT * FROM order_items_info WHERE orderid = ?', [orderId], function (error, results) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    error: 'Database error (order_items_info)'
                });
            }

            const newStatus = caculateStatus(results, res);
            conn.query('update orders SET status = ? WHERE id = ?', [newStatus, orderId], function (err, result) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        success: false,
                        error: 'Database error (orders)'
                    });
                }

                res.json({ success: true });
            });
        });
    });
});

function caculateStatus(results, res) {
    let newStatus = res.locals.s_pending;
    let pending = 0;
    let confirmed = 0;
    let preparing = 0;
    let ready = 0;
    let completed = 0;
    let cancelled = 0;
    results.forEach(element => {
        switch (element.status) {
            case res.locals.s_pending:
                pending++;
                break;
            case res.locals.s_confirmed:
                confirmed++;
                break;
            case res.locals.s_preparing:
                preparing++;
                break;
            case res.locals.s_ready:
                ready++;
                break;
            case res.locals.s_completed:
                completed++;
                break;
            case res.locals.s_cancelled:
                cancelled++;
                break;
        }
    });

    if ( pending > 0 ) {
        newStatus = res.locals.s_pending;
    } else if ( confirmed > 0 ) {
        newStatus = res.locals.s_confirmed;
    } else if ( preparing > 0 ) {
        newStatus = res.locals.s_preparing;
    } else if ( ready > 0 ) {
        newStatus = res.locals.s_ready;
    } else if ( completed > 0 ) {
        newStatus = res.locals.s_completed;
    } else {
        newStatus = res.locals.s_cancelled;
    }

    return newStatus;
}

app.post('/api/deleteItem', function (req, res) {
    const itemId = parseInt(req.body.itemId);

    if (isNaN(itemId)) {
        return res.status(400).json({
                success: false,
                error: 'Invalid itemId'});
    }

    conn.query('DELETE FROM order_items WHERE id = ?', [itemId], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                success: false,
                error: 'Database error (order_items)'});
        }

        conn.query('SELECT * FROM order_items_info WHERE orderid = ?', [res.locals.s_orderId], function (error, results) {
            if (error) {
                return res.status(500).json({
                    success: false,
                    error: 'Database error (order_items_info)'
                });
            }

            const newStatus = caculateStatus(results, res);
            conn.query('update orders SET status = ? WHERE id = ?', [newStatus, res.locals.s_orderId], function (err, result) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        success: false,
                        error: 'Database error (orders)'
                    });
                }

                conn.query('SELECT SUM(price * itemnumber * (100 - discount) / 100) AS total_price, SUM(itemnumber) AS total_number FROM order_items WHERE orderid = ? and status = ?',
                    [res.locals.s_orderId, res.locals.s_pending], function (error3, statisticsResults) {
                        if (error3) {
                            return res.status(500).json({ success: false, error:'Database error (statisticsResults)'});
                        }
                        else if (statisticsResults.length > 0) {
                            res.locals.s_totalMoney = req.session.totalMoney = statisticsResults[0].total_price || 0;
                            res.locals.s_totalNumber = req.session.totalNumber = statisticsResults[0].total_number || 0;
                            res.json({
                                success: true,
                                totalMoney: res.locals.s_totalMoney,
                                totalNumber: res.locals.s_totalNumber 
                            });
                        }
                });
            });
        });
    });
});

app.post('/api/deleteQRCode', function (req, res) {
    const tableNumber = parseInt(req.body.tableNumber);

    if (isNaN(tableNumber)) {
        return res.status(400).json({ success: false, error:'Invalid tableNumber'});
    }

    conn.query('DELETE FROM qrcode WHERE tableNumber = ?', [tableNumber], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        }

        res.json({ success: true });
    });
});

app.post('/api/addQRCode', function (req, res) {
    const table = parseInt(req.body.tableNumber);
    const creator = res.locals.s_username; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'

    // 1. 验证输入
    if (isNaN(table) || table <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid table number (must be a positive integer)' });
    }

    // 2. 检查桌号是否已存在
    conn.query('SELECT * FROM qrcode WHERE tablenumber = ?', [table], function (err, result) {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ success: false, error: 'Database error' });
        }

        if (result.length > 0) {
            return res.status(409).json({ success: false, error: 'Table number already exists' }); // HTTP 409 Conflict
        }

        // 3. 定义路径
        const dirPath = path.join(__dirname, 'public/images/QRCodes'); // 建议存到 public 目录
        const fileName = `table${table}.png`;
        const filePath = path.join(dirPath, fileName);
        const dataPath = `/QRCodes/${fileName}`; // 前端可访问的路径（假设 public 是静态资源目录）
        const url = `http://localhost:3000/table/${table}`; // 二维码内容

        // 4. 创建目录（如果不存在）
        fs.mkdir(dirPath, { recursive: true }, (err) => {
            if (err) {
                console.error('Failed to create directory:', err);
                return res.status(500).json({ success: false, error: 'Failed to create QR code directory' });
            }

            // 5. 生成二维码
            QRCode.toFile(filePath, url, {
                color: { dark: '#000000', light: '#ffffff' },
                width: 300,
                errorCorrectionLevel: 'H'
            }, (err) => {
                if (err) {
                    console.error('QR code generation failed:', err);
                    return res.status(500).json({ success: false, error: 'Failed to generate QR code' });
                }

                // 6. 存入数据库
                const sql = 'INSERT INTO qrcode (tablenumber, creator, createtime, picture) VALUES (?, ?, ?, ?)';
                conn.query(sql, [table, creator, createTime, dataPath], (err, result) => {
                    if (err) {
                        console.error('Database insert error:', err);
                        return res.status(500).json({ success: false, error: 'Failed to save QR code to database.' });
                    } else {
  
                        res.json({ success: true });
                    }
                });
            });
        });
    });
});

app.post('/api/upFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    const showOrder = parseInt(req.body.showOrder);
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid user ID'});
    }
    if (isNaN(showOrder)) {
        return res.status(400).json({ success: false, error:'Invalid showOrder'});
    }

    conn.query('SELECT * FROM food_type WHERE showOrder < ? order by showOrder DESC', [showOrder], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        } else if (result.length > 0) {
            const upShowOrder = result[0].showOrder;
            const upId = result[0].id;

            conn.query('UPDATE food_type SET creator = ?, createtime = ?, showOrder = CASE WHEN id = ? THEN ? WHEN id = ? THEN ? ELSE showOrder END WHERE id IN (?, ?)',
                 [creator, createTime, id, upShowOrder, upId, showOrder, id, upId], function (err1, result1) {
                if (err1) {
                    console.error(err1);
                    return res.status(500).json({ success: false, error:'Database error'});
                }

                res.json({ success: true });
            });
        } else {
            res.json({ success: true });
        }
    });
});

app.post('/api/downFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    const showOrder = parseInt(req.body.showOrder);
    const creator = res.locals.s_username;
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid user ID'});
    }
    if (isNaN(showOrder)) {
        return res.status(400).json({ success: false, error:'Invalid showOrder'});
    }

    conn.query('SELECT * FROM food_type WHERE showOrder > ? order by showOrder ASC', [showOrder], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        } else if (result.length > 0) {
            const downShowOrder = result[0].showOrder;
            const downId = result[0].id;

            conn.query('UPDATE food_type SET creator = ?, createtime = ?, showOrder = CASE WHEN id = ? THEN ? WHEN id = ? THEN ? ELSE showOrder END WHERE id IN (?, ?)',
                 [creator, createTime, id, downShowOrder, downId, showOrder, id, downId], function (err1, result1) {
                if (err1) {
                    console.error(err1);
                    return res.status(500).json({ success: false, error:'Database error'});
                }

                res.json({ success: true });
            });
        }else {
            res.json({ success: true });
        }
    });
});

app.post('/api/updateFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    const available = req.body.available === '1' ? 0 : 1; // Convert to boolean
    const creator = res.locals.s_username; 
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid user ID'});
    }

    conn.query('update food_type set available = ?, creator = ?, createtime = ? WHERE id = ?', [available, creator, createTime, id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        }

        res.json({ success: true });
    });
});

app.post('/api/deleteFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid user ID'});
    }

    conn.query('DELETE FROM food_type WHERE id = ?', [id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        }

        res.json({ success: true });
    });
});

app.post('/api/addFoodtype', (req, res) => {
    const foodTypeName = req.body.foodTypeName;
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    let showOrder = 1;

    conn.query('SELECT MAX(showOrder) as maxorder FROM food_type',
        function (error, results) {
            if (error) {
                return res.status(500).json({ success: false, error:'Database error'});
            } else if (results.length > 0) {
                showOrder = results[0].maxorder;

                const sql = 'INSERT INTO food_type (name, creator, createtime, available, showOrder) VALUES (?, ?, ?, ?, ?)';
                conn.query(sql, [foodTypeName, creator, createTime, 1, showOrder], (err, result) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: 'add Foodtype failed: ' + err.message });
                    } else {
                        res.json({ success: true });
                    }
                });
            }
        });
});


app.post('/api/addMenuItem', upload.single('image'), (req, res) => {
    const name = req.body.itemName;
    const image = req.file ? '/uploads/' + req.file.filename : ''; // 图片路径
    const description = req.body.description;
    const price = parseFloat(req.body.price);
    const foodTypeId = parseInt(req.body.foodtype);
    const discount = parseInt(req.body.discount);
    const creator = res.locals.s_username;
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const available = req.body.available === '1' ? 1 : 0;

    if (isNaN(discount)) {
        return res.status(400).json({ success: false, error:'Invalid discount'});
    }

    if (isNaN(foodTypeId)) {
        return res.status(400).json({ success: false, error:'Invalid foodTypeId'});
    }

    const sql = 'INSERT INTO menu (name, picture, description, price, foodtype, discount, creator, createtime, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    conn.query(sql, [name, image, description, price, foodTypeId, discount, creator, createTime, available], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error:'add MenuItem failed: ' + err.message});
        } else {
            res.json({ success: true, foodTypeId: foodTypeId });
        }
    });
});

function deletePicture(picture) {
    if (picture) {
        const relativePath = picture.startsWith('/') ? picture.slice(1) : picture;
        const filePath = path.join(__dirname, 'public/images', relativePath);

        console.log('Attempting to delete file at:', filePath);

        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Failed to delete image:', err.message);
            } else {
                console.log('Image deleted successfully:', filePath);
            }
        });
    }
}

app.post('/api/deleteMenuItem', (req, res) => {
    const id = parseInt(req.body.id);
    const foodtype = parseInt(req.body.foodtype);

    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid user ID'});
    }

    if (isNaN(foodtype)) {
        return res.status(400).json({ success: false, error:'Invalid foodtype'});
    }

    conn.query('DELETE FROM menu WHERE id = ?', [id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        }

        res.json({ success: true, foodTypeId: foodtype });
    });
});

app.post('/api/listMenuItem', function (req, res) {
    const id = parseInt(req.body.id);
    const foodtype = parseInt(req.body.foodtype);
    const available = req.body.available === '1' ? 0 : 1; // Convert to boolean
    const creator = res.locals.s_username; 
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid user ID'});
    }

    if (isNaN(foodtype)) {
        return res.status(400).json({ success: false, error:'Invalid foodtype'});
    }
    conn.query('update menu set available = ?, creator = ?, createtime = ? WHERE id = ?', [available, creator, createTime, id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        }

        res.json({ success: true, foodTypeId: foodtype });
    });
});

app.post('/api/updateMenuItem', upload.single('image'), (req, res) => {
    const name = req.body.itemName;
    const image = req.file ? '/uploads/' + req.file.filename : ''; // 图片路径
    const description = req.body.description;
    const price = parseFloat(req.body.price);
    const foodTypeId = parseInt(req.body.foodtype);
    const discount = parseInt(req.body.discount);
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    const id = parseInt(req.body.menuId);
    const available = String(req.body.available) === '1' ? 1 : 0; // Convert to boolean

    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid ID'});
    }

    if (isNaN(discount)) {
        return res.status(400).json({ success: false, error:'Invalid discount'});
    }

    if (isNaN(foodTypeId)) {
        return res.status(400).json({ success: false, error:'Invalid foodTypeId'});
    }

    if (image) {
        // delete the old picture before updating
        conn.query('SELECT picture FROM menu WHERE id = ?', [id],
            function (error, results, fields) {
                if (error) {
                    return res.status(500).json({ success: false, error: 'Database error' });
                }

                if (results.length > 0) {
                    const picture = results[0].picture;
                    deletePicture(picture);
                } 
            });

        conn.query('update menu set name = ?, picture = ?, description = ?, price = ?, foodtype = ?, discount = ?, available = ?, creator = ?, createtime = ? WHERE id = ?',
            [name, image, description, price, foodTypeId, discount, available, creator, createTime, id], function (err, result) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, error:'Database error'});
                }

                res.json({ success: true, foodTypeId: foodtype });
            });
    }
    else {
        conn.query('update menu set name = ?, description = ?, price = ?, foodtype = ?, discount = ?, available = ?, creator = ?, createtime = ? WHERE id = ?',
            [name, description, price, foodTypeId, discount, available, creator, createTime, id], function (err, result) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ success: false, error:'Database error'});
                }

                res.json({ success: true, foodTypeId: foodtype });
            });
    }
});

app.post('/api/deleteUser', function (req, res) {
    const id = parseInt(req.body.id);
    if (isNaN(id)) {
        return res.status(400).json({ success: false, error:'Invalid user ID'});
    }

    conn.query('DELETE FROM users WHERE id = ?', [id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, error:'Database error'});
        }

        res.json({ success: true });
    });
});

app.post('/api/addUser', (req, res) => {
    const { username, password, firstname, lastname, phone, email } = req.body;
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    const userType = 1; // Default user type
    const sql = 'INSERT INTO users (username, password, firstname, lastname, phone, email, usertype, creator, createtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    conn.query(sql, [username, password, firstname, lastname, phone, email, userType, creator, createTime], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error:'add user failed: ' + err.message});
        } else {
            res.json({ success: true });
        }
    });
});

//This will be used to update account information.
app.post('/api/updateAccountInfo', function (req, res) {
    const username = req.body.username
    const  userId = +req.body.userId

    if (req.body.password === req.body.repassword) {
        if (username) {
            conn.query('SELECT * FROM users WHERE username = ?', [username],
                function (error, results, fields) {
                    if (error) {
                        return res.status(500).json({ success: false, error: 'Database error' });
                    }

                    if (results.length > 0 && userId != results[0].id) {
                        console.log("Username:", username, " has existed.", userId);
                        res.json({ success: false, error:'Username has existed!'});
                    } else {
                        conn.query('update users set username = ?, firstname = ?, lastname = ?, password = ?, email = ?, phone = ? WHERE id = ?',
                             [req.body.username, req.body.firstname, req.body.lastname, req.body.password, req.body.email, req.body.phone, userId],
                            function (error, results, fields) {
                                if (error) {
                                    return res.status(500).json({ success: false, error: 'Database error' });
                                }

                                console.log("Update user:", username);
                                res.json({ success: true });
                            });
                    }
                });
        } else {
            //username has check in client side
            console.log('Do not have username!');
        }
    } else {
        //password has check in client side
        console.log('Password and Re-entered Password do not match!');
    }
});

//This will be used to reset password.
app.post('/api/reset', function(req, res) {
	let email = req.body.email
    if (email) {
        conn.query('SELECT * FROM users WHERE email = ?', [email], 
            function(error, results, fields) {
                if (error) {
                    return res.status(500).json({ success: false, error: 'Database error' });
                }

                if (results.length > 0) {
                // Here you would typically send an email with a reset link
                // For simplicity, we will just return a success message
                const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: GMAIL_USER,
                        pass: GMAIL_APP_PASSWORD
                    }
                });

                let emailcontent = 'Username: ' + results[0].username + '\n' +
                    'Password: ' + results[0].password + '\n' +
                    'Please change your password after logging in.';
                const mailOptions = {
                    from: GMAIL_USER,
                    to: email,
                    subject: 'Reset Password',
                    text: emailcontent
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    console.log('Sending email to: ' + email);
                    //res.json({ error:'send successfully! Please check your email for further instructions.1'});
                    
                    if (error) {
                        console.error(error);
                        res.status(500).json({ success: false, error:'Send failed: ' + error.message});
                    } else {
                        console.log('Email sent: ' + info.response);
                        res.json({ success: true, error:'send successfully! Please check your email for further instructions.'});
                    }
                });
            } else {
                res.json({ success: false, error:'Email not found!'});
            }
        });
   	} else {
		res.json({ success: false, error:'Please enter Email!'});
	}
});

//This will be used to authenticate username and password.
app.post('/api/auth', function(req, res) {
	let username = req.body.username
    let password = req.body.password
    if (username && password) {
		conn.query('SELECT * FROM users_info WHERE username = ? AND password = ?',
             [username, password], 
		function(error, results, fields) {
            if (error) {
                return res.status(500).json({ success: false, error: 'Database error' });
            }

			if (results.length > 0) {
				req.session.loggedin = true;
				//req.session.password = results[0].password;
                req.session.username = results[0].username;
                req.session.role = results[0].type;
				console.log("User name:",results[0].username, "User role:",results[0].type);
				
                res.json({ success: true });
			} else {
				res.json({ success: false, error:'Incorrect username and/or Password!'});
			}			
		});
	} else {
		res.json({ success: false, error:'Please enter Username and Password!'});
	}
});

app.listen(3000); 
console.log('Node app is running on port 3000'); 
