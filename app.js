var express = require('express'); 
var app = express(); 
var session = require('express-session');
//var conn = require('./dbConfig');

app.set('view engine', 'ejs');

app.use(session({
    secret: 'yoursecret',
    resave: true,
    saveUninitialized: true
}));

app.use('/public', express.static('public'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', function (req, res) {
    req.session.loggedin = false;
  res.render('home',{ session: req.session });
});

app.get('/login',function(req,res){
    res.render("login");
});

app.post('/auth', function(req, res) {
	if (email && password) {
		conn.query('SELECT * FROM usersInfo WHERE username = ? AND password = ?',
             [req.body.username, req.body.password], 
		function(error, results, fields) {
			if (error) throw error;
			if (results.length > 0) {
				req.session.loggedin = true;
				req.session.password = results[0].password;
                req.session.username = results[0].username;
                req.session.role = results[0].role;
				console.log("User name:",results[0].username, "User role:",results[0].role);
				
                res.redirect('/home',{ session: req.session });
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
