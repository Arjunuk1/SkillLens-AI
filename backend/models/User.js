const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // ── Core identity ────────────────────────────────────────────────────────
    fullName: {
      type:     String,
      required: [true, 'Full name is required'],
      trim:     true,
      minlength: [2,  'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be under 80 characters'],
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select:    false, // never returned in queries by default
    },

    // ── Academic profile ─────────────────────────────────────────────────────
    college: {
      type:    String,
      trim:    true,
      default: '',
    },
    branch: {
      type:    String,
      trim:    true,
      default: '',
    },
    year: {
      type: Number,
      min:  [1, 'Year must be between 1 and 5'],
      max:  [5, 'Year must be between 1 and 5'],
    },

    // ── Optional extras ──────────────────────────────────────────────────────
    profilePhoto: {
      type:    String, // URL or base64
      default: '',
    },
    role: {
      type:    String,
      enum:    ['user', 'admin'],
      default: 'user',
    },

    // ── Soft delete ──────────────────────────────────────────────────────────
    isActive: {
      type:    Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt automatically
  }
);

// ── Hash password before saving ──────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  // Only re-hash when password field was actually modified
  if (!this.isModified('password')) return next();
  const salt   = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Instance method: compare plain password with hash ────────────────────────
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// ── Virtual: public-safe profile (no password / internals) ───────────────────
userSchema.methods.toPublicJSON = function () {
  return {
    _id:          this._id,
    fullName:     this.fullName,
    email:        this.email,
    college:      this.college,
    branch:       this.branch,
    year:         this.year,
    profilePhoto: this.profilePhoto,
    role:         this.role,
    createdAt:    this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
