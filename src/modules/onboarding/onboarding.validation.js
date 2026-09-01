const Joi = require('joi');

function calculateAge(dobString) {
  const dob = new Date(dobString);
  const diffMs = Date.now() - dob.getTime();
  const ageDate = new Date(diffMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

const basicInfoSchema = Joi.object({
  displayName: Joi.string().trim().min(1).max(50).required(),
  dateOfBirth: Joi.string().isoDate().required().custom((value, helpers) => {
    const age = calculateAge(value);
    if (age < 18) {
      return helpers.message('You must be at least 18 years old');
    }
    return value;
  }),
  gender: Joi.string().required(),
  customGender: Joi.string().max(50).allow(null, '').optional(),
});

const preferencesSchema = Joi.object({
  interestedIn: Joi.array().items(Joi.string()).min(1).required(),
  relationshipGoal: Joi.string().required(),
});

const photosSchema = Joi.object({
  photos: Joi.array().items(Joi.string().min(1)).min(2).max(6).required(),
});

const interestsSchema = Joi.object({
  interests: Joi.array().items(Joi.string().trim().max(50)).min(3).max(8).required(),
});

const aboutSchema = Joi.object({
  bio: Joi.string().max(300).allow('').optional(),
  occupation: Joi.string().trim().max(100).allow('').optional(),
  heightCm: Joi.number().integer().min(0).max(300).allow(null).optional(),
  smoking: Joi.string().trim().max(50).allow('').optional(),
  drinking: Joi.string().trim().max(50).allow('').optional(),
  pets: Joi.string().trim().max(50).allow('').optional(),
});

const discoverySchema = Joi.object({
  minAge: Joi.number().integer().min(18).max(80).default(21),
  maxAge: Joi.number().integer().min(18).max(80).default(32),
  maxDistanceMeters: Joi.number().integer().min(1000).max(150000).default(25000),
  allowOutsidePreferences: Joi.boolean().default(false),
});

module.exports = {
  basicInfoSchema,
  preferencesSchema,
  photosSchema,
  interestsSchema,
  aboutSchema,
  discoverySchema,
};
