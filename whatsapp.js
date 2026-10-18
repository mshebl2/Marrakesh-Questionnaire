// =========================================================
// WhatsApp Notification Engine for Mawal Marrakech Cafe
// Routes branch survey results to the dedicated manager number
// =========================================================

function formatArabicRating(score) {
  const stars = '★'.repeat(score || 5) + '☆'.repeat(Math.max(0, 5 - (score || 5)));
  return `${score || 5} / 5  (${stars})`;
}

function buildWhatsAppMessage(survey, branch) {
  const branchName = branch ? branch.name : (survey.branchName || 'مقهى موال مراكش');
  const dateStr = new Date(survey.createdAt || Date.now()).toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const overall = survey.overallSatisfaction || survey.ratings?.overall_satisfaction || 5;
  const nps = survey.npsScore !== undefined ? survey.npsScore : (survey.ratings?.nps_score || 10);
  
  let lines = [
    `☕ *مقهى موّال مراكش | إشعار تقييم جديد*`,
    `━━━━━━━━━━━━━━━━━━`,
    `📍 *الفرع:* ${branchName}`,
    `📅 *التاريخ:* ${dateStr}`,
    `⭐ *التقييم العام:* ${formatArabicRating(overall)}`,
    `🚀 *مؤشر التوصية (NPS):* ${nps} من 10`,
    `🕒 *وقت وزمن الزيارة:* ${survey.answers?.visit_time || 'غير محدد'} (${survey.answers?.visit_type || 'صالة'})`
  ];

  if (survey.answers?.beverage_type) {
    lines.push(`☕ *المشروب:* ${survey.answers.beverage_type}`);
  }

  if (survey.ratings?.ordered_food !== undefined) {
    lines.push(`🍽️ *طلب أطعمة/حلويات:* ${survey.ratings.ordered_food ? 'نعم ✓' : 'لا (مشروبات فقط)'}`);
  }

  // Key ratings highlights
  const r = survey.ratings || {};
  let ratingsSummary = [];
  if (r.coffee_taste) ratingsSummary.push(`طعم القهوة/الشاي: ${r.coffee_taste}★`);
  if (r.welcome_reception) ratingsSummary.push(`الاستقبال: ${r.welcome_reception}★`);
  if (r.service_speed || r.prep_time) ratingsSummary.push(`السرعة: ${r.service_speed || r.prep_time}★`);
  if (r.place_cleanliness) ratingsSummary.push(`النظافة: ${r.place_cleanliness}★`);

  if (ratingsSummary.length > 0) {
    lines.push(`📊 *أبرز المؤشرات:* ${ratingsSummary.join(' | ')}`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━`);

  // Open Feedback
  if (survey.answers?.positive_highlight) {
    lines.push(`✨ *أبرز ما أعجب العميل:*`);
    lines.push(`"${survey.answers.positive_highlight}"`);
    lines.push(``);
  }

  if (survey.answers?.improvement_suggestion) {
    lines.push(`⚠️ *مقترحات وملاحظات التحسين:*`);
    lines.push(`"${survey.answers.improvement_suggestion}"`);
    lines.push(``);
  }

  // Customer Contact if provided
  const cName = survey.answers?.customer_name;
  const cPhone = survey.answers?.customer_phone;
  if (cName || cPhone) {
    lines.push(`👤 *بيانات العميل:*`);
    if (cName) lines.push(`• الاسم: ${cName}`);
    if (cPhone) lines.push(`• الجوال: ${cPhone}`);
    if (survey.answers?.customer_email) lines.push(`• البريد: ${survey.answers.customer_email}`);
  } else {
    lines.push(`👤 *بيانات العميل:* مجهول (لم يشارك بياناته طوعاً)`);
  }

  if (survey.voucherCode) {
    lines.push(`🎟️ *كود الخصم الممنوح:* ${survey.voucherCode}`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━`);
  lines.push(`🆔 *رقم التقييم:* ${survey.id}`);
  lines.push(`نظام إدارة الجودة | مقهى موال مراكش - المدينة المنورة`);

  return lines.join('\n');
}

function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d]/g, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }
  if (cleaned.startsWith('05')) {
    cleaned = '966' + cleaned.substring(1);
  }
  return cleaned;
}

function getBranchWhatsAppNumber(branchId) {
  // فرع النبلاء الدور الثاني -> 00966567833138
  // فرع سلطانه الرضا مول -> +966 54 873 1474
  if (branchId === 'branch-1') {
    return '966567833138';
  } else if (branchId === 'branch-2') {
    return '966548731474';
  }
  return '966567833138';
}

function generateWhatsAppUrl(survey, branch) {
  const phone = branch?.whatsappNumber ? cleanPhoneNumber(branch.whatsappNumber) : getBranchWhatsAppNumber(branch?.id || survey.branchId);
  const message = buildWhatsAppMessage(survey, branch);
  const encodedText = encodeURIComponent(message);
  return `https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`;
}

module.exports = {
  buildWhatsAppMessage,
  cleanPhoneNumber,
  getBranchWhatsAppNumber,
  generateWhatsAppUrl
};
