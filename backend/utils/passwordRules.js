const { body } = require('express-validator');

const MESSAGE = 'Password must be at least 8 characters and include a letter and a number';

// Use as: strongPassword('password') inside a route's validator list.
exports.strongPassword = (field) =>
  body(field)
    .isString().withMessage(MESSAGE)
    .isLength({ min: 8, max: 128 }).withMessage(MESSAGE)
    .matches(/[A-Za-z]/).withMessage(MESSAGE)
    .matches(/\d/).withMessage(MESSAGE);
