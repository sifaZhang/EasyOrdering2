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
app.set('view engine','ejs');

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
	secret: 'yoursecret',
	resave: true,
	saveUninitialized: true
}));

//This line will set 全局变量
app.use((req, res, next) => {
    res.locals.s_username = req.session.username || null;
    res.locals.s_role = req.session.role || null;
    next();
});

//These lines will ensure that the express application can handle both JSON and URL-encoded data.
app.use(express.json());
app.use(express.urlencoded({extended: true}));

//This line will check for any request with a URL path starting with '/public'.
app.use(express.static('public'));
app.use('/public', express.static('public'));
app.use('/uploads', express.static(__dirname + '/public/images/uploads'));


app.get('/', function (req, res) {
    res.render('home');
});

app.get('/login', function (req, res) {
    res.render('login');
});

app.get('/resetpwd', function (req, res) {
    res.render('resetpwd');
});

app.get('/allAccounts', function (req, res) {
    conn.query('SELECT * FROM users_info', function (error, results) {
        if (error) {
            return res.status(500).send('Database error (users_info)');
        }

        conn.query('SELECT * FROM user_type', function (error2, results2) {
            if (error2) {
                return res.status(500).send('Database error (user_type)');
            }

            res.render('allAccounts', {
                users: results,
                usertypes: results2,
                addSuccess: req.query.addSuccess,
                deleteSuccess: req.query.deleteSuccess
            });
        });
    });
});


app.get('/customizeFoodtype', function (req, res) {
    conn.query('SELECT * FROM food_type order by showorder ASC', function (error, results) {
        if (error) {
            return res.status(500).send('Database error (food_type)');
        }

        res.render('customizeFoodtype', {
            foodtypes: results,
            addSuccess: req.query.addSuccess,
            updateSuccess: req.query.updateSuccess,
            deleteSuccess: req.query.deleteSuccess
        });
    });
});

app.get('/overviewMenu', function (req, res) {
    conn.query('SELECT * FROM menu_info order by foodtype ASC', function (error, results) {
        if (error) {
            return res.status(500).send('Database error (menu_info)');
        }

        conn.query('SELECT * FROM food_type where available = 1 order by showorder', function (error2, results2) {
            if (error2) {
                return res.status(500).send('Database error (food_type)');
            }

            res.render('overviewMenu', {
                menu: results,
                foodtypes: results2
            });
        });
    });
});

// GET /menuItems?categoryId=123
app.get('/menuItems', function (req, res) {
    const categoryId = parseInt(req.query.categoryId);

    if (isNaN(categoryId)) {
        return res.status(400).json({ error: 'Invalid categoryId' });
    }

    const query = 'SELECT * FROM menu_info WHERE foodtype = ?';

    conn.query(query, [categoryId], function (err, results) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(results); // 返回JSON格式给前端
    });
});

app.get('/customizeMenu', function (req, res) {
    conn.query('SELECT * FROM food_type  where available = 1 order by showOrder ASC', function (error, results) {
        if (error) {
            return res.status(500).send('Database error (food_type)');
        }

        let foodTypeId = null;
        if (results.length > 0) {
            foodTypeId = req.query.foodTypeId ? parseInt(req.query.foodTypeId) : results[0].id;
        }

        res.render('customizeMenu', {
            foodtypes: results,
            foodTypeId: foodTypeId
        });
    });
});


app.get('/updateAccount', function (req, res) {
    if (res.locals.s_username) {
        conn.query('SELECT * FROM users WHERE username = ?', [res.locals.s_username],
            function (error, results) {
                if (error) {
                    res.status(500).send('Database error');
                } else if (results.length === 0) {
                    res.send('User not found');
                } else {
                    const user = results[0];
                    res.render('updateAccount', {
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
        res.send('Please login first!');
    }
});

//This will be used to return to home page after the members logout.
app.get('/logout',(req,res) => {
	console.log("Log out")
    req.session.destroy();
    res.locals.s_username = null;
    res.locals.s_role = null;
	res.redirect('/');
});

app.post('/upFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    const showOrder = parseInt(req.body.showOrder);
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).send('Invalid user ID');
    }
    if (isNaN(showOrder)) {
        return res.status(400).send('Invalid showOrder');
    }

    conn.query('SELECT * FROM food_type WHERE showOrder < ? order by showOrder DESC', [showOrder], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        } else if (result.length > 0) {
            upShowOrder = result[0].showOrder;
            upId = result[0].id;

            conn.query('UPDATE food_type SET creator = ?, createtime = ?, showOrder = CASE WHEN id = ? THEN ? WHEN id = ? THEN ? ELSE showOrder END WHERE id IN (?, ?)',
                 [creator, createTime, id, upShowOrder, upId, showOrder, id, upId], function (err1, result1) {
                if (err1) {
                    console.error(err1);
                    return res.status(500).send('Database error');
                }

                res.redirect('/customizeFoodtype?updateSuccess=1');
            });
        } else {
            res.redirect('/customizeFoodtype');
        }
    });
});

app.post('/downFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    const showOrder = parseInt(req.body.showOrder);
    const creator = res.locals.s_username;
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).send('Invalid user ID');
    }
    if (isNaN(showOrder)) {
        return res.status(400).send('Invalid showOrder');
    }

    conn.query('SELECT * FROM food_type WHERE showOrder > ? order by showOrder ASC', [showOrder], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        } else if (result.length > 0) {
            downShowOrder = result[0].showOrder;
            downId = result[0].id;

            conn.query('UPDATE food_type SET creator = ?, createtime = ?, showOrder = CASE WHEN id = ? THEN ? WHEN id = ? THEN ? ELSE showOrder END WHERE id IN (?, ?)',
                 [creator, createTime, id, downShowOrder, downId, showOrder, id, downId], function (err1, result1) {
                if (err1) {
                    console.error(err1);
                    return res.status(500).send('Database error');
                }

                res.redirect('/customizeFoodtype?updateSuccess=1');
            });
        }else {
            res.redirect('/customizeFoodtype');
        }
    });
});

app.post('/updateFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    const available = req.body.available === '1' ? false : true; // Convert to boolean
    const creator = res.locals.s_username; 
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).send('Invalid user ID');
    }

    conn.query('update food_type set available = ?, creator = ?, createtime = ? WHERE id = ?', [available, creator, createTime, id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        res.redirect('/customizeFoodtype?updateSuccess=1');
    });
});

app.post('/deleteFoodtype', function (req, res) {
    const id = parseInt(req.body.id);
    if (isNaN(id)) {
        return res.status(400).send('Invalid user ID');
    }

    conn.query('DELETE FROM food_type WHERE id = ?', [id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        res.redirect('/customizeFoodtype?deleteSuccess=1');
    });
});

app.post('/addFoodtype', (req, res) => {
    const foodTypeName = req.body.foodTypeName;
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    let showOrder = 1;

    conn.query('SELECT MAX(showOrder) as maxorder FROM food_type',
        function (error, results) {
            if (error) {
                res.status(500).send('Database error');
            } else if (results.length > 0) {
                showOrder = results[0].maxorder;
            }
        });


    const sql = 'INSERT INTO food_type (name, creator, createtime, available, showOrder) VALUES (?, ?, ?, ?, ?)';
    conn.query(sql, [foodTypeName, creator, createTime, true, showOrder], (err, result) => {
        if (err) {
            res.status(500).send('add Foodtype failed: ' + err.message);
        } else {
            res.redirect('/customizeFoodtype?addSuccess=1');
        }
    });
});


app.post('/addMenuItem', upload.single('image'), (req, res) => {
    const name = req.body.itemName;
    const image = req.file ? '/uploads/' + req.file.filename : ''; // 图片路径
    const description = req.body.description;
    const price = parseFloat(req.body.price);
    const foodTypeId = parseInt(req.body.foodtype);
    const discount = parseInt(req.body.discount);
    const creator = res.locals.s_username;
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const available = req.body.available === '1';

    if (isNaN(discount)) {
        return res.status(400).send('Invalid discount');
    }

    if (isNaN(foodTypeId)) {
        return res.status(400).send('Invalid foodTypeId');
    }

    const sql = 'INSERT INTO menu (name, picture, description, price, foodtype, discount, creator, createtime, available) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    conn.query(sql, [name, image, description, price, foodTypeId, discount, creator, createTime, available], (err, result) => {
        if (err) {
            res.status(500).send('add MenuItem failed: ' + err.message);
        } else {
            res.redirect('/customizeMenu?foodTypeId=' + foodTypeId);
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

app.post('/deleteMenuItem', (req, res) => {
    const id = parseInt(req.body.id);
    const foodtype = parseInt(req.body.foodtype);

    if (isNaN(id)) {
        return res.status(400).send('Invalid user ID');
    }

    if (isNaN(foodtype)) {
        return res.status(400).send('Invalid foodtype');
    }

    conn.query('DELETE FROM menu WHERE id = ?', [id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        res.redirect('/customizeMenu?foodTypeId=' + foodtype);
    });
});

app.post('/listMenuItem', function (req, res) {
    const id = parseInt(req.body.id);
    const foodtype = parseInt(req.body.foodtype);
    const available = req.body.available === '1' ? false : true; // Convert to boolean
    const creator = res.locals.s_username; 
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    
    if (isNaN(id)) {
        return res.status(400).send('Invalid user ID');
    }

    if (isNaN(foodtype)) {
        return res.status(400).send('Invalid foodtype');
    }
    conn.query('update menu set available = ?, creator = ?, createtime = ? WHERE id = ?', [available, creator, createTime, id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        res.redirect('/customizeMenu?foodTypeId=' + foodtype);
    });
});

app.post('/updateMenuItem', upload.single('image'), (req, res) => {
    const name = req.body.itemName;
    const image = req.file ? '/uploads/' + req.file.filename : ''; // 图片路径
    const description = req.body.description;
    const price = parseFloat(req.body.price);
    const foodTypeId = parseInt(req.body.foodtype);
    const discount = parseInt(req.body.discount);
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    const id = parseInt(req.body.menuId);
    const available = String(req.body.available) === '1' ? true : false; // Convert to boolean

    if (isNaN(id)) {
        return res.status(400).send('Invalid ID');
    }

    if (isNaN(discount)) {
        return res.status(400).send('Invalid discount');
    }

    if (isNaN(foodTypeId)) {
        return res.status(400).send('Invalid foodTypeId');
    }

    if (image) {
        // delete the old picture before updating
        conn.query('SELECT picture FROM menu WHERE id = ?', [id],
            function (error, results, fields) {
                if (error) throw error;
                if (results.length > 0) {
                    const picture = results[0].picture;
                    deletePicture(picture);
                } 
            });

        conn.query('update menu set name = ?, picture = ?, description = ?, price = ?, foodtype = ?, discount = ?, available = ?, creator = ?, createtime = ? WHERE id = ?',
            [name, image, description, price, foodTypeId, discount, available, creator, createTime, id], function (err, result) {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Database error');
                }

                res.redirect('/customizeMenu?foodTypeId=' + foodTypeId);
            });
    }
    else {
        conn.query('update menu set name = ?, description = ?, price = ?, foodtype = ?, discount = ?, available = ?, creator = ?, createtime = ? WHERE id = ?',
            [name, description, price, foodTypeId, discount, available, creator, createTime, id], function (err, result) {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Database error');
                }

                res.redirect('/customizeMenu?foodTypeId=' + foodTypeId);
            });
    }
});

app.post('/deleteUser', function (req, res) {
    const id = parseInt(req.body.id);
    if (isNaN(id)) {
        return res.status(400).send('Invalid user ID');
    }

    conn.query('DELETE FROM users WHERE id = ?', [id], function (err, result) {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }

        res.redirect('/allAccounts?deleteSuccess=1');
    });
});

app.post('/addUser', (req, res) => {
    const { username, password, firstname, lastname, phone, email } = req.body;
    const creator = res.locals.s_username || 'admin'; // Default to 'admin' if not logged in
    const createTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Format as 'YYYY-MM-DD HH:MM:SS'
    const userType = 1; // Default user type
    const sql = 'INSERT INTO users (username, password, firstname, lastname, phone, email, usertype, creator, createtime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    conn.query(sql, [username, password, firstname, lastname, phone, email, userType, creator, createTime], (err, result) => {
        if (err) {
            res.status(500).send('add user failed: ' + err.message);
        } else {
            res.redirect('/allAccounts?addSuccess=1');
        }
    });
});

//This will be used to update account information.
app.post('/updateAccountInfo', function (req, res) {
    const username = req.body.username
    const  userId = +req.body.userId

    if (req.body.password === req.body.repassword) {
        if (username) {
            conn.query('SELECT * FROM users WHERE username = ?', [username],
                function (error, results, fields) {
                    if (error) throw error;
                    if (results.length > 0 && userId != results[0].id) {
                        console.log("Username:", username, " has existed.", userId);
                        res.send('Username has existed!');
                    } else {
                        conn.query('update users set username = ?, firstname = ?, lastname = ?, password = ?, email = ?, phone = ? WHERE id = ?',
                             [req.body.username, req.body.firstname, req.body.lastname, req.body.password, req.body.email, req.body.phone, userId],
                            function (error, results, fields) {
                                if (error) throw error;
                                console.log("Update user:", username);
                                res.redirect('/updateAccount?success=1');
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
app.post('/reset', function(req, res) {
	let email = req.body.email
    if (email) {
        conn.query('SELECT * FROM users WHERE email = ?', [email], 
            function(error, results, fields) {
            if (error) throw error;
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
                    //res.send('send successfully! Please check your email for further instructions.1');
                    
                    if (error) {
                        console.error(error);
                        res.status(500).send('Send failed: ' + error.message);
                    } else {
                        console.log('Email sent: ' + info.response);
                        res.send('send successfully! Please check your email for further instructions.');
                    }
                });
            } else {
                res.send('Email not found!');
            }
            //res.end();
        });
   	} else {
		res.send('Please enter Email!');
		//res.end();
	}
});

//This will be used to authenticate username and password.
app.post('/auth', function(req, res) {
	let username = req.body.username
    let password = req.body.password
    if (username && password) {
		conn.query('SELECT * FROM users_info WHERE username = ? AND password = ?',
             [username, password], 
		function(error, results, fields) {
			if (error) throw error;
			if (results.length > 0) {
				req.session.loggedin = true;
				req.session.password = results[0].password;
                req.session.username = results[0].username;
                req.session.role = results[0].type;
				console.log("User name:",results[0].username, "User role:",results[0].type);
				
                res.redirect('/');
			} else {
				res.send('Incorrect username and/or Password!');
			}			
			res.end();
		});
	} else {
		res.send('Please enter Username and Password!');
		res.end();
	}
});

app.listen(3000); 
console.log('Node app is running on port 3000'); 
