const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, default: 'admin@mawal-marrakech.com' },
  name: { type: String, default: 'مدير العمليات والجودة' },
  role: { type: String, default: 'superadmin' },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const BranchSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: { type: String, required: true },
  city: { type: String, default: 'المدينة المنورة' },
  active: { type: Boolean, default: true },
  address: { type: String, default: '' },
  whatsappNumber: { type: String, default: '' },
  whatsappDisplay: { type: String, default: '' },
  managerName: { type: String, default: '' }
}, { timestamps: true });

const QuestionSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  sectionKey: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  skippable: { type: Boolean, default: false },
  conditionQuestion: { type: String, default: null },
  questions: { type: Array, default: [] }
}, { timestamps: true });

const SurveySchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  branchId: { type: String, required: true, index: true },
  branchName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  ratings: { type: mongoose.Schema.Types.Mixed, default: {} },
  answers: { type: mongoose.Schema.Types.Mixed, default: {} },
  averageScore: { type: Number, default: 5 },
  npsScore: { type: Number, default: 10 },
  overallSatisfaction: { type: Number, default: 5 },
  durationSeconds: { type: Number, default: 120 },
  status: { type: String, default: 'new' },
  adminNotes: { type: String, default: '' },
  voucherCode: { type: String, default: '' }
}, { timestamps: true });

const SettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: 'global' },
  cafeName: { type: String, default: 'مقهى موال مراكش' },
  cafeSlogan: { type: String, default: 'أصالة المذاق المغربي والقهوة المختصة • المدينة المنورة' },
  welcomeMessage: { type: String, default: '' },
  discountRewardPercent: { type: Number, default: 10 },
  discountRewardCode: { type: String, default: 'MAWAL10' },
  googleMapsUrl: { type: String, default: 'https://maps.google.com' },
  instagramUrl: { type: String, default: 'https://instagram.com/mawal_marrakech' },
  allowAnonymous: { type: Boolean, default: true },
  enableRaffle: { type: Boolean, default: true }
}, { timestamps: true });

const Admin = mongoose.model('Admin', AdminSchema);
const Branch = mongoose.model('Branch', BranchSchema);
const Question = mongoose.model('Question', QuestionSchema);
const Survey = mongoose.model('Survey', SurveySchema);
const Setting = mongoose.model('Setting', SettingSchema);

module.exports = {
  Admin,
  Branch,
  Question,
  Survey,
  Setting
};
