const Joi = require('joi');

const saveAnswersSchema = Joi.object({
  answers: Joi.array()
    .items(
      Joi.object({
        questionId: Joi.number().integer().min(1).max(10).required(),
        selectedOption: Joi.string().trim().min(1).max(100).required(),
      }).required()
    )
    .min(1)
    .max(10)
    .unique('questionId')
    .required(),
});

module.exports = {
  saveAnswersSchema,
};
