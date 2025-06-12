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
app.use('/public', express.static('public'));


app.get('/', function (req, res) {
    res.render('home');
});

app.get('/login', function (req, res) {
    res.render('login');
});

app.get('/resetpwd', function (req, res) {
    res.render('resetpwd');
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
                        email: user.email
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



//This will be used to update account information.
app.post('/updateAccountInfo', function(req, res) {
	let username = req.body.username
    let userId = req.body.userid

    if (req.body.password === req.body.repassword) {
        if (username) {
            conn.query('SELECT * FROM users WHERE username = ?', [username],
                function (error, results, fields) {
                    if (error) throw error;
                    if (results.length > 0 && userId != results[0].id) {
                        console.log("Username:", username, " has existed.");
                        document.getElementById('err_username').setCustomValidity('username has existed!');
                    } else {
                        
                    }
                    
                });
        } else {
            document.getElementById('err_username').setCustomValidity('Please enter Username and Password!');
        }
    } else {
        console.log('Password and Re-entered Password do not match!');
        document.getElementById('err_rePassword').setCustomValidity('Password and Re-entered Password do not match!');
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
                        user: 'easyerordering@gmail.com',
                        pass: 'vlpn loik ktbz ytiu'
                    }
                });

                let emailcontent = 'Username: ' + results[0].username + '\n' +
                    'Password: ' + results[0].password + '\n' +
                    'Please change your password after logging in.';
                const mailOptions = {
                    from: 'easyerordering@gmail.com',
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
		conn.query('SELECT * FROM usersInfo WHERE username = ? AND password = ?',
             [username, password], 
		function(error, results, fields) {
			if (error) throw error;
			if (results.length > 0) {
				req.session.loggedin = true;
				req.session.password = results[0].password;
                req.session.username = results[0].username;
                req.session.role = results[0].role;
				console.log("User name:",results[0].username, "User role:",results[0].role);
				
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
