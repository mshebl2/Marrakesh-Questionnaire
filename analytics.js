// Analytics and intelligent insight engine for Cafe Survey Platform

function filterSurveys(surveys, filters = {}) {
  const { branchId, dateRange, visitTime, minRating } = filters;
  const now = new Date();

  return surveys.filter(s => {
    // Branch filter
    if (branchId && branchId !== 'all' && s.branchId !== branchId) {
      return false;
    }

    // Visit time filter
    if (visitTime && visitTime !== 'all') {
      const vTime = s.answers?.visit_time || '';
      if (!vTime.includes(visitTime)) return false;
    }

    // Min rating filter
    if (minRating && minRating !== 'all') {
      const numMin = Number(minRating);
      if (s.overallSatisfaction < numMin) return false;
    }

    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const surveyDate = new Date(s.createdAt);
      if (dateRange === 'today') {
        if (surveyDate.toDateString() !== now.toDateString()) return false;
      } else if (dateRange === '7days') {
        const diffDays = (now - surveyDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) return false;
      } else if (dateRange === '30days') {
        const diffDays = (now - surveyDate) / (1000 * 60 * 60 * 24);
        if (diffDays > 30) return false;
      }
    }

    return true;
  });
}

function calculateAnalytics(surveys) {
  const total = surveys.length;
  if (total === 0) {
    return {
      totalSubmissions: 0,
      averageSatisfaction: 0,
      csatPercent: 0,
      npsScore: 0,
      npsBreakdown: { promoters: 0, passives: 0, detractors: 0, promotersPct: 0, passivesPct: 0, detractorsPct: 0 },
      sectionsBreakdown: {},
      questionAverages: {},
      topStrengths: [],
      topWeaknesses: [],
      smartInsights: [],
      timeline: [],
      visitTimes: {},
      visitTypes: {}
    };
  }

  // 1. Overall Satisfaction & CSAT
  const totalSatisfaction = surveys.reduce((acc, s) => acc + (s.overallSatisfaction || 5), 0);
  const averageSatisfaction = Number((totalSatisfaction / total).toFixed(2));
  const satisfiedCount = surveys.filter(s => (s.overallSatisfaction || 0) >= 4).length;
  const csatPercent = Math.round((satisfiedCount / total) * 100);

  // 2. NPS (Net Promoter Score)
  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  surveys.forEach(s => {
    const score = s.npsScore !== undefined ? s.npsScore : 10;
    if (score >= 9) promoters++;
    else if (score >= 7) passives++;
    else detractors++;
  });

  const promotersPct = Math.round((promoters / total) * 100);
  const passivesPct = Math.round((passives / total) * 100);
  const detractorsPct = Math.round((detractors / total) * 100);
  const npsScore = promotersPct - detractorsPct;

  // 3. Question-level averages & labels
  const questionMeta = {
    // General
    overall_satisfaction: { label: 'الرضا العام الكلي', section: 'التقييم العام' },
    // Barista
    welcome_reception: { label: 'حسن الاستقبال والترحيب', section: 'فريق العمل والباريستا' },
    staff_attitude: { label: 'لباقة وحسن تعامل الفريق', section: 'فريق العمل والباريستا' },
    barista_knowledge: { label: 'احترافية ومعرفة الباريستا', section: 'فريق العمل والباريستا' },
    service_speed: { label: 'سرعة أخذ وتجاوب الطلب', section: 'فريق العمل والباريستا' },
    // Beverages
    coffee_taste: { label: 'جودة ونقاء طعم القهوة', section: 'المشروبات والقهوة' },
    temperature_perfection: { label: 'مناسبة درجة حرارة المشروب', section: 'المشروبات والقهوة' },
    presentation_art: { label: 'جمال التقديم والـ Latte Art', section: 'المشروبات والقهوة' },
    menu_variety: { label: 'تنوع قائمة المشروبات والبدائل', section: 'المشروبات والقهوة' },
    // Food
    food_taste: { label: 'لذة طعم المأكولات والحلويات', section: 'الأطعمة والحلويات' },
    food_freshness: { label: 'طزاجة المخبوزات وحرارتها', section: 'الأطعمة والحلويات' },
    portion_size: { label: 'حجم الحصة ومناسبتها', section: 'الأطعمة والحلويات' },
    food_variety: { label: 'تنوع خيارات الحلويات والمخبوزات', section: 'الأطعمة والحلويات' },
    // Ambiance
    seating_comfort: { label: 'راحة الجلسات ومقابس الشحن', section: 'المكان والأجواء والنظافة' },
    decor_lighting: { label: 'جمال الديكور ودفء الإضاءة', section: 'المكان والأجواء والنظافة' },
    ac_comfort: { label: 'ملاءمة التكييف والحرارة', section: 'المكان والأجواء والنظافة' },
    place_cleanliness: { label: 'نظافة الصالة وسرعة إخلاء الطاولات', section: 'المكان والأجواء والنظافة' },
    restrooms_cleanliness: { label: 'نظافة وتجهيز دورات المياه', section: 'المكان والأجواء والنظافة' },
    privacy_quiet: { label: 'الهدوء والخصوصية للعمل والدراسة', section: 'المكان والأجواء والنظافة' },
    // Sound
    music_volume: { label: 'مستوى صوت الموسيقى والهدوء', section: 'الصوت والموسيقى' },
    music_taste: { label: 'ملاءمة نوع الموسيقى للمكان', section: 'الصوت والموسيقى' },
    noise_level: { label: 'مستوى الهدوء وسهولة الحديث', section: 'الصوت والموسيقى' },
    // Service
    prep_time: { label: 'سرعة تجهيز الطلب وتسليمه', section: 'سرعة الخدمة ودقة الطلبات' },
    order_accuracy: { label: 'دقة الطلب ومطابقته التامة', section: 'سرعة الخدمة ودقة الطلبات' },
    inquiry_handling: { label: 'مرونة التعامل مع الاستفسارات', section: 'سرعة الخدمة ودقة الطلبات' },
    // Pricing
    value_for_money: { label: 'القيمة المستحقة مقابل السعر', section: 'الأسعار والعروض والقيمة' },
    pricing_clarity: { label: 'وضوح قائمة الأسعار شاملة الضريبة', section: 'الأسعار والعروض والقيمة' },
    promotions_loyalty: { label: 'جاذبية العروض وبرامج الولاء', section: 'الأسعار والعروض والقيمة' },
    // Accessibility
    location_convenience: { label: 'سهولة الوصول لموقع الفرع', section: 'سهولة الوصول والمواقف والدفع' },
    parking_availability: { label: 'توفر وسهولة مواقف السيارات', section: 'سهولة الوصول والمواقف والدفع' },
    payment_smoothness: { label: 'سلاسة وتنوع وسائل الدفع الرقمي', section: 'سهولة الوصول والمواقف والدفع' }
  };

  const questionSums = {};
  const questionCounts = {};

  surveys.forEach(s => {
    if (s.ratings) {
      Object.entries(s.ratings).forEach(([key, val]) => {
        if (typeof val === 'number' && key !== 'nps_score') {
          if (!questionSums[key]) {
            questionSums[key] = 0;
            questionCounts[key] = 0;
          }
          questionSums[key] += val;
          questionCounts[key] += 1;
        }
      });
    }
  });

  const questionAverages = {};
  const questionList = [];

  Object.keys(questionSums).forEach(key => {
    const avg = Number((questionSums[key] / questionCounts[key]).toFixed(2));
    const meta = questionMeta[key] || { label: key, section: 'أخرى' };
    questionAverages[key] = {
      id: key,
      label: meta.label,
      section: meta.section,
      average: avg,
      count: questionCounts[key],
      percentage: Math.round((avg / 5) * 100)
    };
    questionList.push(questionAverages[key]);
  });

  // Sort to find strengths and weaknesses
  questionList.sort((a, b) => b.average - a.average);
  const topStrengths = questionList.slice(0, 4);
  const topWeaknesses = questionList.slice(-4).reverse();

  // 4. Section averages
  const sectionsDef = {
    barista: { name: 'الباريستا وطاقم العمل', keys: ['welcome_reception', 'staff_attitude', 'barista_knowledge', 'service_speed'] },
    beverages: { name: 'المشروبات وجودة القهوة', keys: ['coffee_taste', 'temperature_perfection', 'presentation_art', 'menu_variety'] },
    food: { name: 'الأطعمة والحلويات والمخبوزات', keys: ['food_taste', 'food_freshness', 'portion_size', 'food_variety'] },
    ambiance: { name: 'المكان والأجواء والنظافة', keys: ['seating_comfort', 'decor_lighting', 'ac_comfort', 'place_cleanliness', 'restrooms_cleanliness', 'privacy_quiet'] },
    sound: { name: 'الصوت والموسيقى والهدوء', keys: ['music_volume', 'music_taste', 'noise_level'] },
    service: { name: 'سرعة ودقة تجهيز الطلبات', keys: ['prep_time', 'order_accuracy', 'inquiry_handling'] },
    pricing: { name: 'الأسعار والقيمة المضافة', keys: ['value_for_money', 'pricing_clarity', 'promotions_loyalty'] },
    accessibility: { name: 'المواقف والدفع وسهولة الوصول', keys: ['location_convenience', 'parking_availability', 'payment_smoothness'] }
  };

  const sectionsBreakdown = {};
  Object.entries(sectionsDef).forEach(([secKey, secObj]) => {
    let sum = 0;
    let count = 0;
    secObj.keys.forEach(k => {
      if (questionAverages[k]) {
        sum += questionAverages[k].average;
        count++;
      }
    });
    const avg = count > 0 ? Number((sum / count).toFixed(2)) : 0;
    sectionsBreakdown[secKey] = {
      key: secKey,
      name: secObj.name,
      average: avg,
      percentage: Math.round((avg / 5) * 100)
    };
  });

  // 5. Intelligent Actionable Weak Point & Opportunity Insights
  const smartInsights = [];

  // Check parking
  if (questionAverages['parking_availability'] && questionAverages['parking_availability'].average < 3.8) {
    smartInsights.push({
      type: 'critical',
      tag: 'المواقف والوصول',
      title: 'صعوبة في توفر مواقف السيارات',
      description: `معدل رضا المواقف (${questionAverages['parking_availability'].average}/5) يعتبر من أقل المؤشرات. تكررت شكاوى العملاء بخصوص الازدحام في أوقات الذروة.`,
      recommendation: 'يُنصح بالتنسيق مع إدارة المبنى أو توفير خدمة Valet في عطلة نهاية الأسبوع وتوجيه العملاء للمواقف الخلفية عبر لافتات واضحة.'
    });
  }

  // Check music volume / sound
  if (questionAverages['music_volume'] && questionAverages['music_volume'].average < 4.0) {
    smartInsights.push({
      type: 'warning',
      tag: 'الموسيقى والضوضاء',
      title: 'ملاحظات متكررة على مستوى صوت الموسيقى',
      description: `تقييم صوت الموسيقى (${questionAverages['music_volume'].average}/5) يشير إلى أن بعض العملاء يجدون الصوت مرتفعاً، خصوصاً في فترات المساء وجلسات العمل.`,
      recommendation: 'اعتماد سياسة خفض مستوى الصوت بنسبة 25% بعد الساعة 4 مساءً، واختيار قوائم Lo-Fi أو Acoustic هادئة تساعد على الاسترخاء والتركيز.'
    });
  }

  // Check prep speed
  if (questionAverages['prep_time'] && questionAverages['prep_time'].average < 4.0) {
    smartInsights.push({
      type: 'warning',
      tag: 'سرعة التحضير',
      title: 'تأخر في تجهيز الطلبات في أوقات الذروة',
      description: `متوسط سرعة تجهيز الطلب سجل (${questionAverages['prep_time'].average}/5). العملاء يلاحظون زيادة وقت الانتظار عند ازدحام الطلبات الخارجية.`,
      recommendation: 'إعادة توزيع مهام الباريستا بين محطة الإسبريسو ومحطة التقطير اليدوي وتعيين مساعد باريستا لتسليم الطلبات السريعة.'
    });
  }

  // Check restrooms
  if (questionAverages['restrooms_cleanliness'] && questionAverages['restrooms_cleanliness'].average < 4.2) {
    smartInsights.push({
      type: 'info',
      tag: 'نظافة دورات المياه',
      title: 'الحاجة لتكثيف جدول نظافة دورات المياه',
      description: `سجل تقييم النظافة (${questionAverages['restrooms_cleanliness'].average}/5) انخفاضاً طفيفاً خلال الفترات المسائية المزدحمة.`,
      recommendation: 'تفعيل جدول تفقد إلكتروني كل 45 دقيقة مع وضع معطرات جو أوتوماتيكية وتجديد المناديل والمعقمات باستمرار.'
    });
  }

  // Check coffee quality strength
  if (questionAverages['coffee_taste'] && questionAverages['coffee_taste'].average >= 4.7) {
    smartInsights.push({
      type: 'success',
      tag: 'نقطة قوة كبرى',
      title: 'إشادة استثنائية بنقاء وجودة القهوة والمحاصيل',
      description: `معدل رضا طعم القهوة (${questionAverages['coffee_taste'].average}/5) هو الأعلى بين جميع المعايير، مع إشادة خاصة بمحاصيل الفلتر والـ Latte Art.`,
      recommendation: 'استثمار هذه النقطة في الحملات التسويقية وإبراز مصدر المحاصيل وقصص المزارع على الأكواب ووسائل التواصل الاجتماعي.'
    });
  }

  // 6. Timeline Trends (by day)
  const timelineMap = {};
  surveys.forEach(s => {
    const rawDate = s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt || new Date().toISOString());
    const dayKey = rawDate.substring(0, 10);
    if (!timelineMap[dayKey]) {
      timelineMap[dayKey] = { date: dayKey, count: 0, sumScore: 0 };
    }
    timelineMap[dayKey].count++;
    timelineMap[dayKey].sumScore += (s.averageScore || 5);
  });

  const timeline = Object.keys(timelineMap)
    .sort()
    .map(key => ({
      date: key,
      count: timelineMap[key].count,
      avgScore: Number((timelineMap[key].sumScore / timelineMap[key].count).toFixed(2))
    }));

  // 7. Visit Times Distribution
  const visitTimes = {};
  surveys.forEach(s => {
    const vt = s.answers?.visit_time || 'غير محدد';
    visitTimes[vt] = (visitTimes[vt] || 0) + 1;
  });

  // 8. Visit Types Distribution
  const visitTypes = {};
  surveys.forEach(s => {
    const vt = s.answers?.visit_type || 'جلسة في الصالة';
    visitTypes[vt] = (visitTypes[vt] || 0) + 1;
  });

  return {
    totalSubmissions: total,
    averageSatisfaction,
    csatPercent,
    npsScore,
    npsBreakdown: {
      promoters,
      passives,
      detractors,
      promotersPct,
      passivesPct,
      detractorsPct
    },
    sectionsBreakdown,
    questionAverages,
    topStrengths,
    topWeaknesses,
    smartInsights,
    timeline,
    visitTimes,
    visitTypes
  };
}

module.exports = {
  filterSurveys,
  calculateAnalytics
};
