require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');

const db = require('./database');
const { filterSurveys, calculateAnalytics } = require('./analytics');
const { generateWhatsAppUrl, buildWhatsAppMessage, cleanPhoneNumber } = require('./whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'aroma-artisan-coffee-secret-key-2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'غير مصرح لك، يرجى تسجيل الدخول أولاً' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول' });
  }
}

// ==========================================
// Public Routes
// ==========================================

// 1. Get public cafe config & questions
app.get('/api/config', (req, res) => {
  try {
    const settings = db.getSettings();
    const branches = db.getBranches().filter(b => b.active);
    const questions = db.getQuestions();
    res.json({
      success: true,
      data: {
        settings,
        branches,
        questions
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحميل الإعدادات' });
  }
});

// 2. Submit customer survey
app.post('/api/surveys', async (req, res) => {
  try {
    const { branchId, ratings, answers, durationSeconds } = req.body;

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'يرجى اختيار فرع الكافيه' });
    }

    if (!ratings || !ratings.overall_satisfaction) {
      return res.status(400).json({ success: false, message: 'يرجى تقديم التقييم العام للتجربة' });
    }

    // Save survey to database
    const newSurvey = await db.addSurvey({
      branchId,
      ratings,
      answers,
      durationSeconds: durationSeconds || 120
    });

    // Branch details for WhatsApp notification routing
    const branch = db.getBranches().find(b => b.id === branchId) || db.getBranches()[0];
    const whatsappUrl = generateWhatsAppUrl(newSurvey, branch);
    const managerPhone = branch?.whatsappDisplay || branch?.whatsappNumber || (branch?.id === 'branch-2' ? '+966 54 873 1474' : '00966567833138');
    const whatsappMessage = buildWhatsAppMessage(newSurvey, branch);

    res.status(201).json({
      success: true,
      message: 'شكراً لك! تم استلام تقييمك بنجاح',
      data: {
        id: newSurvey.id,
        voucherCode: newSurvey.voucherCode,
        createdAt: newSurvey.createdAt,
        branchId: branch.id,
        branchName: branch.name,
        whatsappUrl,
        whatsappMessage,
        managerPhone,
        managerName: branch.managerName || (branch.id === 'branch-2' ? 'مشرف فرع سلطانة' : 'مشرف فرع النبلاء')
      }
    });
  } catch (err) {
    console.error('Error submitting survey:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء حفظ التقييم، يرجى المحاولة ثانية' });
  }
});

// 3. Admin Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    }

    // Allow login via username or email
    const admin = db.findAdminByUsername(username) || db.findAdminByEmail(username);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    const isMatch = bcrypt.compareSync(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, email: admin.email || 'admin@mawal-marrakech.com', name: admin.name, role: admin.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      data: {
        token,
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email || 'admin@mawal-marrakech.com',
          name: admin.name,
          role: admin.role
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ في الخادم' });
  }
});

// ==========================================
// Protected Admin Routes
// ==========================================

// Verify Token
app.get('/api/auth/verify', authenticateAdmin, (req, res) => {
  const admin = db.findAdminByUsername(req.admin.username) || req.admin;
  res.json({
    success: true,
    admin: {
      id: admin.id,
      username: admin.username,
      email: admin.email || 'admin@mawal-marrakech.com',
      name: admin.name,
      role: admin.role
    }
  });
});

// Get Admin Profile
app.get('/api/auth/profile', authenticateAdmin, (req, res) => {
  const admin = db.findAdminByUsername(req.admin.username);
  if (!admin) {
    return res.status(404).json({ success: false, message: 'حساب المشرف غير موجود' });
  }
  res.json({
    success: true,
    data: {
      id: admin.id,
      username: admin.username,
      email: admin.email || 'admin@mawal-marrakech.com',
      name: admin.name || 'مدير العمليات والجودة',
      role: admin.role || 'superadmin'
    }
  });
});

// Update Admin Profile (Email, Name, Username, and Password)
app.put('/api/auth/profile', authenticateAdmin, (req, res) => {
  try {
    const { currentPassword, email, name, username, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ success: false, message: 'يرجى إدخال كلمة المرور الحالية لتأكيد التعديلات' });
    }

    const admin = db.findAdminByUsername(req.admin.username);
    if (!admin || !bcrypt.compareSync(currentPassword, admin.passwordHash)) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }

    if (newPassword && newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
    }

    // Check if new username is already taken by another admin
    if (username && username.trim().toLowerCase() !== admin.username.toLowerCase()) {
      const existing = db.findAdminByUsername(username.trim());
      if (existing) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم الجديد مستخدم بالفعل، اختر اسماً آخر' });
      }
    }

    // Update profile
    const updated = db.updateAdminProfile(admin.username, {
      email,
      name,
      username,
      newPassword
    });

    // Re-issue JWT token with updated username/email
    const token = jwt.sign(
      { id: updated.id, username: updated.username, email: updated.email, name: updated.name, role: updated.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'تم تحديث بيانات الحساب والأمان بنجاح ✓',
      data: {
        token,
        admin: {
          id: updated.id,
          username: updated.username,
          email: updated.email,
          name: updated.name,
          role: updated.role
        }
      }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث بيانات الحساب' });
  }
});

// Change Admin Password (Legacy endpoint)
app.post('/api/auth/change-password', authenticateAdmin, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
    }

    const admin = db.findAdminByUsername(req.admin.username);
    if (!admin || !bcrypt.compareSync(currentPassword, admin.passwordHash)) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }

    db.updateAdminPassword(req.admin.username, newPassword);
    res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث كلمة المرور' });
  }
});

// Analytics Dashboard Endpoint
app.get('/api/analytics', authenticateAdmin, (req, res) => {
  try {
    const { branchId, dateRange, visitTime, minRating } = req.query;
    const allSurveys = db.getAllSurveys();
    const filtered = filterSurveys(allSurveys, { branchId, dateRange, visitTime, minRating });
    const analytics = calculateAnalytics(filtered);

    res.json({
      success: true,
      data: {
        analytics,
        totalInDb: allSurveys.length,
        filteredCount: filtered.length
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء احتساب المؤشرات' });
  }
});

// List Surveys with Filtering & Pagination
app.get('/api/surveys', authenticateAdmin, (req, res) => {
  try {
    const { branchId, dateRange, visitTime, minRating, search, status, page = 1, limit = 20 } = req.query;
    let surveys = db.getAllSurveys();

    // Base filters
    surveys = filterSurveys(surveys, { branchId, dateRange, visitTime, minRating });

    // Status filter
    if (status && status !== 'all') {
      surveys = surveys.filter(s => s.status === status);
    }

    // Search filter (in text answers or customer name/phone)
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      surveys = surveys.filter(s => {
        const name = (s.answers?.customer_name || '').toLowerCase();
        const phone = (s.answers?.customer_phone || '').toLowerCase();
        const highlight = (s.answers?.positive_highlight || '').toLowerCase();
        const suggestion = (s.answers?.improvement_suggestion || '').toLowerCase();
        const voucher = (s.voucherCode || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || highlight.includes(q) || suggestion.includes(q) || voucher.includes(q);
      });
    }

    const totalRecords = surveys.length;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedSurveys = surveys.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      data: {
        surveys: paginatedSurveys,
        pagination: {
          total: totalRecords,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalRecords / limitNum) || 1
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'حدث خطأ في استرجاع التقييمات' });
  }
});

// Single Survey Details
app.get('/api/surveys/:id', authenticateAdmin, (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ success: false, message: 'التقييم غير موجود' });
  }

  const branch = db.getBranches().find(b => b.id === survey.branchId) || db.getBranches()[0];
  const whatsappManagerUrl = generateWhatsAppUrl(survey, branch);
  let whatsappCustomerUrl = null;
  if (survey.answers?.customer_phone) {
    const cleanCust = cleanPhoneNumber(survey.answers.customer_phone);
    const custMsg = encodeURIComponent(`مرحباً ${survey.answers?.customer_name || 'عزيزنا العميل'} من مقهى موال مراكش بالمدينة المنورة ☕\nنشكرك جزيلاً على تقييمك ومشاركتك لملاحظاتك القيمة، ويسعدنا دائماً خدمتكم بأعلى معايير الجودة.`);
    whatsappCustomerUrl = `https://api.whatsapp.com/send?phone=${cleanCust}&text=${custMsg}`;
  }

  res.json({
    success: true,
    data: {
      ...survey,
      whatsappManagerUrl,
      whatsappCustomerUrl,
      managerPhone: branch ? (branch.whatsappDisplay || branch.whatsappNumber || (branch.id === 'branch-2' ? '+966 54 873 1474' : '00966567833138')) : '',
      managerName: branch ? (branch.managerName || (branch.id === 'branch-2' ? 'مشرف فرع سلطانة' : 'مشرف فرع النبلاء')) : 'مشرف الفرع'
    }
  });
});

// Update Survey Status & Admin Notes
app.patch('/api/surveys/:id', authenticateAdmin, (req, res) => {
  const { status, adminNotes } = req.body;
  const updated = db.updateSurveyStatus(req.params.id, { status, adminNotes });
  if (!updated) {
    return res.status(404).json({ success: false, message: 'التقييم غير موجود' });
  }
  res.json({ success: true, message: 'تم تحديث حالة التقييم بنجاح', data: updated });
});

// Delete Survey
app.delete('/api/surveys/:id', authenticateAdmin, (req, res) => {
  const success = db.deleteSurvey(req.params.id);
  if (!success) {
    return res.status(404).json({ success: false, message: 'التقييم غير موجود' });
  }
  res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
});

// Branches CRUD
app.get('/api/branches', (req, res) => {
  const branches = db.getBranches();
  const allSurveys = db.getAllSurveys();

  // Attach branch stats
  const enriched = branches.map(b => {
    const branchSurveys = allSurveys.filter(s => s.branchId === b.id);
    const count = branchSurveys.length;
    const avg = count > 0 
      ? Number((branchSurveys.reduce((acc, s) => acc + (s.averageScore || 5), 0) / count).toFixed(2))
      : 0;
    return {
      ...b,
      responsesCount: count,
      averageRating: avg
    };
  });

  res.json({ success: true, data: enriched });
});

app.post('/api/branches', authenticateAdmin, (req, res) => {
  const { name, city, address, whatsappNumber, whatsappDisplay } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'يرجى إدخال اسم الفرع' });
  }
  const branch = db.addBranch({ name: name.trim(), city, address, whatsappNumber, whatsappDisplay });
  res.status(201).json({ success: true, message: 'تم إضافة الفرع بنجاح', data: branch });
});

app.patch('/api/branches/:id', authenticateAdmin, (req, res) => {
  const updated = db.updateBranch(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, message: 'الفرع غير موجود' });
  }
  res.json({ success: true, message: 'تم تحديث بيانات الفرع', data: updated });
});

// Questions Configuration CRUD
app.get('/api/questions', authenticateAdmin, (req, res) => {
  res.json({ success: true, data: db.getQuestions() });
});

app.put('/api/questions', authenticateAdmin, (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ success: false, message: 'صيغة الأسئلة غير صالحة' });
  }
  const updated = db.updateQuestions(questions);
  res.json({ success: true, message: 'تم حفظ إعدادات وتخصيص الأسئلة بنجاح', data: updated });
});

// Settings Endpoints
app.get('/api/settings', authenticateAdmin, (req, res) => {
  res.json({ success: true, data: db.getSettings() });
});

app.put('/api/settings', authenticateAdmin, (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json({ success: true, message: 'تم حفظ الإعدادات بنجاح', data: updated });
});

// ==========================================
// Data Export Endpoints
// ==========================================

// 1. Export Excel (.xlsx)
app.get('/api/export/excel', authenticateAdmin, (req, res) => {
  try {
    const { branchId, dateRange, visitTime } = req.query;
    let surveys = db.getAllSurveys();
    surveys = filterSurveys(surveys, { branchId, dateRange, visitTime });

    const rows = surveys.map(s => {
      return {
        'رقم التقييم': s.id,
        'الفرع': s.branchName,
        'تاريخ وتوقيت التقييم': new Date(s.createdAt).toLocaleString('ar-SA'),
        'التقييم العام (من 5)': s.overallSatisfaction,
        'مؤشر NPS (من 10)': s.npsScore,
        'المتوسط الكلي': s.averageScore,
        'نوع الزيارة': s.answers?.visit_type || '-',
        'فترة الزيارة': s.answers?.visit_time || '-',
        'المشروب المفضل': s.answers?.beverage_type || '-',
        'طلب أطعمة؟': s.ratings?.ordered_food ? 'نعم' : 'لا',
        'طعم القهوة': s.ratings?.coffee_taste || '-',
        'حسن الاستقبال': s.ratings?.welcome_reception || '-',
        'تعامل الفريق': s.ratings?.staff_attitude || '-',
        'سرعة التجهيز': s.ratings?.prep_time || '-',
        'نظافة الصالة': s.ratings?.place_cleanliness || '-',
        'نظافة دورات المياه': s.ratings?.restrooms_cleanliness || '-',
        'صوت الموسيقى': s.ratings?.music_volume || '-',
        'مواقف السيارات': s.ratings?.parking_availability || '-',
        'القيمة مقابل السعر': s.ratings?.value_for_money || '-',
        'أبرز ما أعجب العميل': s.answers?.positive_highlight || '-',
        'مقترحات التطوير': s.answers?.improvement_suggestion || '-',
        'اسم العميل': s.answers?.customer_name || 'فاعل خير (مجهول)',
        'رقم الجوال': s.answers?.customer_phone || '-',
        'البريد الإلكتروني': s.answers?.customer_email || '-',
        'كود القسيمة': s.voucherCode || '-',
        'حالة المعالجة': s.status === 'resolved' ? 'تم الحل' : (s.status === 'in_progress' ? 'قيد المتابعة' : 'جديد'),
        'ملاحظات الإدارة': s.adminNotes || '-'
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'تقييمات العملاء');

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', 'attachment; filename="mawal_marrakech_surveys.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Export Excel error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تصدير ملف Excel' });
  }
});

// 2. Export CSV (with UTF-8 BOM for Arabic support in Excel)
app.get('/api/export/csv', authenticateAdmin, (req, res) => {
  try {
    const { branchId, dateRange, visitTime } = req.query;
    let surveys = db.getAllSurveys();
    surveys = filterSurveys(surveys, { branchId, dateRange, visitTime });

    const headers = [
      'رقم التقييم', 'الفرع', 'تاريخ التقييم', 'التقييم العام', 'مؤشر NPS', 'المتوسط الكلي',
      'نوع الزيارة', 'فترة الزيارة', 'المشروب', 'طلب طعام؟', 'طعم القهوة والشاي', 'حسن الاستقبال',
      'سرعة التجهيز', 'نظافة الصالة', 'المواقف', 'القيمة مقابل السعر', 'أبرز ما أعجب العميل',
      'مقترحات التطوير', 'اسم العميل', 'رقم الجوال', 'كود الخصم', 'الحالة'
    ];

    const csvRows = [headers.join(',')];

    surveys.forEach(s => {
      const escape = text => `"${String(text || '').replace(/"/g, '""')}"`;
      const row = [
        escape(s.id),
        escape(s.branchName),
        escape(new Date(s.createdAt).toLocaleDateString('ar-SA')),
        escape(s.overallSatisfaction),
        escape(s.npsScore),
        escape(s.averageScore),
        escape(s.answers?.visit_type),
        escape(s.answers?.visit_time),
        escape(s.answers?.beverage_type),
        escape(s.ratings?.ordered_food ? 'نعم' : 'لا'),
        escape(s.ratings?.coffee_taste),
        escape(s.ratings?.welcome_reception),
        escape(s.ratings?.prep_time),
        escape(s.ratings?.place_cleanliness),
        escape(s.ratings?.parking_availability),
        escape(s.ratings?.value_for_money),
        escape(s.answers?.positive_highlight),
        escape(s.answers?.improvement_suggestion),
        escape(s.answers?.customer_name || 'مجهول'),
        escape(s.answers?.customer_phone || '-'),
        escape(s.voucherCode),
        escape(s.status)
      ];
      csvRows.push(row.join(','));
    });

    const bomBuffer = Buffer.from([0xEF, 0xBB, 0xBF]);
    const csvBuffer = Buffer.from(csvRows.join('\r\n'), 'utf8');
    const finalBuffer = Buffer.concat([bomBuffer, csvBuffer]);

    res.setHeader('Content-Disposition', 'attachment; filename="mawal_marrakech_surveys.csv"');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(finalBuffer);
  } catch (err) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تصدير ملف CSV' });
  }
});

// Friendly URL redirects
const PUBLIC_DIR = path.join(__dirname, 'public');

app.get('/admin', (req, res) => {
  res.sendFile('admin.html', { root: PUBLIC_DIR });
});

app.get('/login', (req, res) => {
  res.sendFile('login.html', { root: PUBLIC_DIR });
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile('index.html', { root: PUBLIC_DIR });
});

// Start Server
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`☕ Mawal Marrakech Cafe Survey Platform running at http://localhost:${PORT}`);
    console.log(`📊 Admin Dashboard available at http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
