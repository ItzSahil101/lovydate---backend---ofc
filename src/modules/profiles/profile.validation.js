const Joi = require('joi');

function isAtLeast18(value, helpers) {
  const date = new Date(value);
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const birthdayHasPassed =
    now.getUTCMonth() > date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() >= date.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age >= 18 ? value : helpers.message('You must be at least 18 years old');
}

const profilePatchSchema = Joi.object({
  displayName: Joi.string().trim().min(1).max(50),
  dateOfBirth: Joi.date().iso().max('now').custom(isAtLeast18),
  bio: Joi.string().trim().max(500).allow(''),
  relationshipGoal: Joi.string().trim().max(100).allow('', null),
  city: Joi.string().trim().max(100).allow(''),
  occupation: Joi.string().trim().max(100).allow(''),
  heightCm: Joi.number().integer().min(100).max(250).allow(null),
  smoking: Joi.string().trim().max(50).allow(''),
  drinking: Joi.string().trim().max(50).allow(''),
  pets: Joi.string().trim().max(50).allow(''),
  photos: Joi.array().items(Joi.alternatives().try(Joi.string().min(1), Joi.object())).max(20),
  interests: Joi.array().items(Joi.alternatives().try(Joi.string().trim().max(50), Joi.object())).max(20),
}).min(1);

module.exports = { profilePatchSchema };
