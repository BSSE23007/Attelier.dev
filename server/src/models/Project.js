import mongoose from "mongoose";

const projectImageSchema = new mongoose.Schema({
  publicId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
    match: /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/,
  },
  secureUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048,
    match: /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\//,
  },
  width: { type: Number, min: 1, max: 30000 },
  height: { type: Number, min: 1, max: 30000 },
  format: { type: String, enum: ["jpg", "jpeg", "png", "webp", "avif"] },
}, { _id: false, strict: "throw" });

const projectSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 120,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    unique: true,
  },
  shortDescription: { type: String, required: true, trim: true, minlength: 10, maxlength: 500 },
  category: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  technologies: {
    type: [{ type: String, trim: true, minlength: 1, maxlength: 40 }],
    default: [],
    validate: { validator: (items) => items.length <= 20, message: "A project can have at most 20 technologies." },
  },
  coverImage: { type: projectImageSchema, default: null },
  gallery: {
    type: [projectImageSchema],
    default: [],
    validate: { validator: (items) => items.length <= 12, message: "A project can have at most 12 gallery images." },
  },
  liveUrl: { type: String, trim: true, maxlength: 2048 },
  featured: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  displayOrder: { type: Number, min: 0, max: 1000000, default: 0 },
}, { timestamps: true, strict: "throw" });

projectSchema.index({ published: 1, featured: -1, displayOrder: 1, createdAt: -1, _id: 1 });

const Project = mongoose.models.Project || mongoose.model("Project", projectSchema);

export default Project;
