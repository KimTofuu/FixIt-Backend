const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const reputationRoutes = require('./routes/reputation');
require('dotenv').config();

const connectDB = require('./config/mongodb'); 

//Initialize Routes
const usersRouter = require('./routes/users');
const reportsRouter = require('./routes/reports');
const adminRouter = require('./routes/admin');
const authoritiesRouter = require('./routes/authorities');

const app = express();

connectDB();

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(cookieParser());

// API Routes
app.use('/users', usersRouter);
app.use('/reports', reportsRouter);
app.use('/admin', adminRouter);
app.use('/auth', require('./routes/auth'));
app.use('/reputation', reputationRoutes);
app.use('/authorities', authoritiesRouter);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
    });
});
module.exports = app;