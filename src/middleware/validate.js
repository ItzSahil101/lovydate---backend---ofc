const { BadRequestError } = require('../shared/errors');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map((d) => d.message.replace(/['"]/g, '')).join(', ');
      return next(new BadRequestError(message, 'VALIDATION_ERROR'));
    }

    req[source] = value;
    next();
  };
}

module.exports = { validate };
