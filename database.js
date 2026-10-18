require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { Admin, Branch, Question, Survey, Setting } = require('./models');

function uuidv4() {
  return crypto.randomUUID();
}

const DB_PATH = path.join(__dirname, 'data', 'db.json');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mawal_marrakech';

// Default questions configuration
const DEFAULT_QUESTIONS = [
  {
    id: 'sec_general',
    sectionKey: 'general',
    title: 'التقييم العام ونوع الزيارة',
    description: 'انطباعك الكلي عن التجربة واحتمالية ترشيح الكافيه لأحبائك',
    skippable: false,
    questions: [
      { id: 'overall_satisfaction', type: 'stars', label: 'ما هو تقييمك الكلي لتجربتك في كافيه أرومة اليوم؟', required: true, max: 5 },
      { id: 'nps_score', type: 'nps', label: 'ما مدى احتمالية ترشيحك لكافيه أرومة لأصدقائك وزملائك؟ (مقياس NPS من 0 إلى 10)', required: true, min: 0, max: 10 },
      { id: 'visit_type', type: 'choice', label: 'طبيعة الزيارة اليوم:', options: ['جلسة داخلية في الصالة', 'طلب خارجي (سفري)', 'جلسة خارجية / تراس', 'خدمة السيارات / درايف ثرو'], required: true },
      { id: 'visit_time', type: 'choice', label: 'فترة الزيارة:', options: ['الصباح الباكر (7 ص - 11 ص)', 'فترة الظهيرة (11 ص - 4 ع)', 'فترة المساء (4 ع - 9 م)', 'فترة السهرة (9 م - 12 ص)'], required: true }
    ]
  },
  {
    id: 'sec_barista',
    sectionKey: 'barista',
    title: 'فريق العمل والباريستا',
    description: 'تقييم كفاءة طاقم الضيافة وحسن الاستقبال وسرعة تلبية طلبك',
    skippable: false,
    questions: [
      { id: 'welcome_reception', type: 'stars', label: 'حرارة الترحيب وحسن الاستقبال عند دخول الكافيه', required: true, max: 5 },
      { id: 'staff_attitude', type: 'stars', label: 'اللباقة والابتسامة وحسن التعامل من فريق الصالة', required: true, max: 5 },
      { id: 'barista_knowledge', type: 'stars', label: 'احترافية الباريستا ومعرفته بخلطات ومحاصيل القهوة', required: true, max: 5 },
      { id: 'service_speed', type: 'stars', label: 'سرعة البدء في أخذ طلبك والتجاوب الفوري', required: true, max: 5 }
    ]
  },
  {
    id: 'sec_beverages',
    sectionKey: 'beverages',
    title: 'المشروبات والقهوة المختصة',
    description: 'جودة المشروبات، النكهة، حرارة التقديم وفن اللاتيه',
    skippable: false,
    questions: [
      { id: 'coffee_taste', type: 'stars', label: 'جودة ونقاء الطعم وتوازن نكهة القهوة', required: true, max: 5 },
      { id: 'temperature_perfection', type: 'stars', label: 'مناسبة درجة حرارة المشروب (ساخن تماماً / مثلج بانتعاش)', required: true, max: 5 },
      { id: 'presentation_art', type: 'stars', label: 'جمال التقديم وفن الرسم بالحليب (Latte Art) ونظافة الكوب', required: true, max: 5 },
      { id: 'menu_variety', type: 'stars', label: 'تنوع خيارات المشروبات وتوفر البدائل (حليب الشوفان، جوز الهند، خالي من الكافيين)', required: true, max: 5 },
      { id: 'beverage_type', type: 'choice', allowCustomInput: true, label: 'ما هو المشروب الذي جربته اليوم؟ (يمكنك الاختيار من القائمة أو كتابة مشروبك بحرية)', options: ['شاي مغربي أصيل بالنعناع', 'فلات وايت / كابتشينو', 'قهوة مقطرة V60 حار أو مثلج', 'سبانش لاتيه / قهوة باردة', 'كولد برو / نيترو', 'أمريكانو / كورتادو', 'مشروب موال مراكش الخاص', 'عصير منعش / موهيتو'], required: false }
    ]
  },
  {
    id: 'sec_food',
    sectionKey: 'food',
    title: 'الأطعمة والحلويات والمخبوزات',
    description: 'تقييم الحلويات والمخبوزات (يمكنك تخطي هذا القسم إذا لم تطلب أطعمة)',
    skippable: true,
    conditionQuestion: 'ordered_food',
    questions: [
      { id: 'ordered_food', type: 'boolean', label: 'هل قمت بطلب حلويات أو مخبوزات أو أطعمة خفيفة أثناء زيارتك؟', required: true },
      { id: 'food_taste', type: 'stars', label: 'لذة الطعم وجودة المكونات', required: false, max: 5 },
      { id: 'food_freshness', type: 'stars', label: 'طزاجة وهشاشة الكرواسون والحلويات وحرارتها', required: false, max: 5 },
      { id: 'portion_size', type: 'stars', label: 'حجم القطعة والكمية مقارنة بالتوقع', required: false, max: 5 },
      { id: 'food_variety', type: 'stars', label: 'تنوع خيارات الحلويات والمخبوزات وتوفر بدائل صحية', required: false, max: 5 }
    ]
  },
  {
    id: 'sec_ambiance',
    sectionKey: 'ambiance',
    title: 'المكان والأجواء والنظافة',
    description: 'راحة المقاعد، الإضاءة، التكييف، النظافة ونظافة دورات المياه',
    skippable: false,
    questions: [
      { id: 'seating_comfort', type: 'stars', label: 'راحة الكراسي وتوزيع الجلسات وتوفر مقابس شحن', required: true, max: 5 },
      { id: 'decor_lighting', type: 'stars', label: 'جمال الديكور ودفء الإضاءة والأجواء الجمالية', required: true, max: 5 },
      { id: 'ac_comfort', type: 'stars', label: 'ملاءمة التكييف ودرجة الحرارة في الصالة', required: true, max: 5 },
      { id: 'place_cleanliness', type: 'stars', label: 'نظافة الصالة والطاولات وسرعة رفع الأكواب المستخدمة', required: true, max: 5 },
      { id: 'restrooms_cleanliness', type: 'stars', label: 'نظافة وتجهيز دورات المياه ورائحتها وتوفر المعقمات', required: true, max: 5 },
      { id: 'privacy_quiet', type: 'stars', label: 'توفر مساحات مريحة للعمل أو الدراسة أو الخصوصية', required: true, max: 5 }
    ]
  },
  {
    id: 'sec_sound',
    sectionKey: 'sound',
    title: 'الصوت والموسيقى والضوضاء',
    description: 'مستوى الصوت، نوعية الأغاني وهدوء الصالة',
    skippable: false,
    questions: [
      { id: 'music_volume', type: 'stars', label: 'مستوى صوت الموسيقى (1: غير مريح ومزعج، 5: متزن ومثالي تماماً)', required: true, max: 5 },
      { id: 'music_taste', type: 'stars', label: 'اختيار قائمة الموسيقى وملاءمتها لهوية الكافيه وروقانه', required: true, max: 5 },
      { id: 'noise_level', type: 'stars', label: 'مستوى الهدوء العام داخل الصالة وسهولة التحدث مع مرافقيك', required: true, max: 5 }
    ]
  },
  {
    id: 'sec_service',
    sectionKey: 'service',
    title: 'سرعة الخدمة ودقة الطلبات',
    description: 'زمن الانتظار، دقة تنفيذ طلبك والتعامل مع أي استفسار',
    skippable: false,
    questions: [
      { id: 'prep_time', type: 'stars', label: 'سرعة تجهيز الطلب وتسليمه في وقت قياسي', required: true, max: 5 },
      { id: 'order_accuracy', type: 'stars', label: 'دقة الطلب ومطابقته التامة (نوع الحليب، مستوى السكر، درجة الطحن)', required: true, max: 5 },
      { id: 'inquiry_handling', type: 'stars', label: 'مرونة الفريق واحترافيتهم عند الاستفسار أو طلب أي تعديل', required: true, max: 5 }
    ]
  },
  {
    id: 'sec_pricing',
    sectionKey: 'pricing',
    title: 'الأسعار والعروض والقيمة',
    description: 'القيمة مقابل المال، وضوح الأسعار والعروض الترويجية',
    skippable: false,
    questions: [
      { id: 'value_for_money', type: 'stars', label: 'ملاءمة الأسعار لجودة القهوة والمستوى المقدم (القيمة مقابل المال)', required: true, max: 5 },
      { id: 'pricing_clarity', type: 'stars', label: 'وضوح قائمة الأسعار شاملة الضريبة دون أي غموض', required: true, max: 5 },
      { id: 'promotions_loyalty', type: 'stars', label: 'جاذبية العروض الترويجية وبطاقات الولاء وبرامج المكافآت', required: true, max: 5 }
    ]
  },
  {
    id: 'sec_accessibility',
    sectionKey: 'accessibility',
    title: 'سهولة الوصول والمواقف والدفع',
    description: 'موقع الكافيه، مواقف السيارات، وخيارات الدفع الرقمي',
    skippable: false,
    questions: [
      { id: 'location_convenience', type: 'stars', label: 'سهولة الوصول لموقع الفرع واللوحات الإرشادية', required: true, max: 5 },
      { id: 'parking_availability', type: 'stars', label: 'توفر مواقف سيارات مريحة وسهلة وقريبة من المدخل', required: true, max: 5 },
      { id: 'payment_smoothness', type: 'stars', label: 'سلاسة وسرعة الدفع وتوفر جميع الخيارات (مدى، Apple Pay، بطاقات)', required: true, max: 5 }
    ]
  },
  {
    id: 'sec_open_feedback',
    sectionKey: 'open_feedback',
    title: 'رأيك الشخصي وبيانات التواصل (اختياري)',
    description: 'ما أعجبك، ما يمكننا تحسينه، وسحب القسائم الأسبوعية',
    skippable: false,
    questions: [
      { id: 'positive_highlight', type: 'text', label: 'ما أكثر ما نال إعجابك وميز زيارتك اليوم في مقهى موال مراكش؟', placeholder: 'مثال: الشاي المغربي بالنعناع ممتاز، والقهوة مضبوطة، والجلسات مريحة...', required: false },
      { id: 'improvement_suggestion', type: 'text', label: 'ما هي أهم اقتراحاتك أو الملاحظات التي تود أن نطورها في زيارتك القادمة؟', placeholder: 'مثال: نتمنى توفير مقابس شحن إضافية في الطابق العلوي، وتخفيض صوت الموسيقى عصراً...', required: false },
      { id: 'wants_raffle', type: 'boolean', label: 'هل ترغب بالدخول في السحب الأسبوعي على قسائم مجانية ومتابعة ملاحظاتك؟', required: false },
      { id: 'customer_name', type: 'input', label: 'الاسم الكريم (اختياري):', placeholder: 'مثال: محمد السعدي', required: false },
      { id: 'customer_phone', type: 'input', label: 'رقم الجوال (اختياري):', placeholder: '05xxxxxxxx', required: false },
      { id: 'customer_email', type: 'input', label: 'البريد الإلكتروني (اختياري):', placeholder: 'name@example.com', required: false }
    ]
  }
];

const DEFAULT_BRANCHES = [
  {
    id: 'branch-1',
    name: 'فرع النبلاء - الدور الثاني',
    city: 'المدينة المنورة',
    active: true,
    address: 'حي النبلاء، الدور الثاني',
    whatsappNumber: '966567833138',
    whatsappDisplay: '00966567833138',
    managerName: 'مشرف فرع النبلاء'
  },
  {
    id: 'branch-2',
    name: 'فرع سلطانة - الرضا مول - الدور الثاني',
    city: 'المدينة المنورة',
    active: true,
    address: 'طريق سلطانة، الرضا مول، الدور الثاني',
    whatsappNumber: '966548731474',
    whatsappDisplay: '+966 54 873 1474',
    managerName: 'مشرف فرع سلطانة'
  }
];

// Pre-seeded realistic customer responses to make the dashboard immediately useful and rich
function generateInitialSurveys() {
  const sampleFeedbacks = [
    {
      branchId: 'branch-1',
      ratings: {
        overall_satisfaction: 5, nps_score: 10, welcome_reception: 5, staff_attitude: 5, barista_knowledge: 5, service_speed: 4,
        coffee_taste: 5, temperature_perfection: 5, presentation_art: 5, menu_variety: 4,
        ordered_food: true, food_taste: 5, food_freshness: 5, portion_size: 4, food_variety: 4,
        seating_comfort: 5, decor_lighting: 5, ac_comfort: 4, place_cleanliness: 5, restrooms_cleanliness: 5, privacy_quiet: 4,
        music_volume: 5, music_taste: 5, noise_level: 4,
        prep_time: 4, order_accuracy: 5, inquiry_handling: 5,
        value_for_money: 4, pricing_clarity: 5, promotions_loyalty: 4,
        location_convenience: 5, parking_availability: 3, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'فترة المساء (4 ع - 9 م)',
        beverage_type: 'فلات وايت / كابتشينو',
        positive_highlight: 'القهوة مضبوطة جداً والـ Latte Art كان متقناً ورائعاً، والباريستا تعاملهم راقي ومحترم.',
        improvement_suggestion: 'المواقف مزدحمة قليلاً في عطلة نهاية الأسبوع، لو يتم توفير خدمة صف سيارات.',
        wants_raffle: true,
        customer_name: 'عبدالله القحطاني',
        customer_phone: '0554129841',
        customer_email: 'abdullah.q@gmail.com'
      },
      daysAgo: 0,
      status: 'resolved',
      adminNotes: 'تم شكر العميل وتقديم كود خصم 20% تقديراً لمشاركته.'
    },
    {
      branchId: 'branch-2',
      ratings: {
        overall_satisfaction: 4, nps_score: 9, welcome_reception: 4, staff_attitude: 5, barista_knowledge: 4, service_speed: 4,
        coffee_taste: 5, temperature_perfection: 4, presentation_art: 4, menu_variety: 5,
        ordered_food: false,
        seating_comfort: 5, decor_lighting: 5, ac_comfort: 5, place_cleanliness: 5, restrooms_cleanliness: 4, privacy_quiet: 5,
        music_volume: 4, music_taste: 4, noise_level: 4,
        prep_time: 4, order_accuracy: 5, inquiry_handling: 4,
        value_for_money: 4, pricing_clarity: 4, promotions_loyalty: 4,
        location_convenience: 5, parking_availability: 5, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'الصباح الباكر (7 ص - 11 ص)',
        beverage_type: 'قهوة مقطرة V60 حار أو مثلج',
        positive_highlight: 'أجواء الصباح هادئة وممتازة للعمل عن بعد والإنترنت سريع جداً.',
        improvement_suggestion: 'يا ليت تزيدون تشكيلة الساندوتشات الصحية للصباح.',
        wants_raffle: true,
        customer_name: 'سارة الشمري',
        customer_phone: '0503387122',
        customer_email: 'sara.sh@outlook.com'
      },
      daysAgo: 1,
      status: 'new'
    },
    {
      branchId: 'branch-1',
      ratings: {
        overall_satisfaction: 3, nps_score: 5, welcome_reception: 4, staff_attitude: 3, barista_knowledge: 4, service_speed: 2,
        coffee_taste: 4, temperature_perfection: 3, presentation_art: 4, menu_variety: 4,
        ordered_food: true, food_taste: 4, food_freshness: 3, portion_size: 3, food_variety: 3,
        seating_comfort: 4, decor_lighting: 5, ac_comfort: 3, place_cleanliness: 4, restrooms_cleanliness: 3, privacy_quiet: 3,
        music_volume: 2, music_taste: 3, noise_level: 2,
        prep_time: 2, order_accuracy: 3, inquiry_handling: 3,
        value_for_money: 3, pricing_clarity: 4, promotions_loyalty: 3,
        location_convenience: 4, parking_availability: 2, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'فترة المساء (4 ع - 9 م)',
        beverage_type: 'سبانش لاتيه / مشروب بارد مميز',
        positive_highlight: 'الديكور جميل والقهوة طيبة المذاق.',
        improvement_suggestion: 'تأخر الطلب أكثر من 20 دقيقة، وصوت الموسيقى كان مرتفعاً ومزعجاً، نرجو خفض الصوت.',
        wants_raffle: true,
        customer_name: 'فهد المنصور',
        customer_phone: '0567712390',
        customer_email: 'f.almansoor@yahoo.com'
      },
      daysAgo: 2,
      status: 'in_progress',
      adminNotes: 'تم التنبيه على مشرف الوردية المسائية بضبط مستوى الصوت ومتابعة سرعة الباريستا.'
    },
    {
      branchId: 'branch-3',
      ratings: {
        overall_satisfaction: 5, nps_score: 10, welcome_reception: 5, staff_attitude: 5, barista_knowledge: 5, service_speed: 5,
        coffee_taste: 5, temperature_perfection: 5, presentation_art: 5, menu_variety: 5,
        ordered_food: true, food_taste: 5, food_freshness: 5, portion_size: 4, food_variety: 5,
        seating_comfort: 4, decor_lighting: 5, ac_comfort: 5, place_cleanliness: 5, restrooms_cleanliness: 5, privacy_quiet: 4,
        music_volume: 4, music_taste: 5, noise_level: 4,
        prep_time: 5, order_accuracy: 5, inquiry_handling: 5,
        value_for_money: 4, pricing_clarity: 5, promotions_loyalty: 5,
        location_convenience: 4, parking_availability: 4, payment_smoothness: 5
      },
      answers: {
        visit_type: 'طلب خارجي (سفري)',
        visit_time: 'الصباح الباكر (7 ص - 11 ص)',
        beverage_type: 'فلات وايت / كابتشينو',
        positive_highlight: 'أسرع خدمة في العليا! استلمت طلبي في أقل من دقيقتين والحرارة مثالية.',
        improvement_suggestion: 'استمروا بنفس هذا المستوى الممتاز، وشكراً لكم.',
        wants_raffle: false
      },
      daysAgo: 2,
      status: 'new'
    },
    {
      branchId: 'branch-4',
      ratings: {
        overall_satisfaction: 5, nps_score: 9, welcome_reception: 5, staff_attitude: 5, barista_knowledge: 5, service_speed: 5,
        coffee_taste: 5, temperature_perfection: 5, presentation_art: 5, menu_variety: 4,
        ordered_food: true, food_taste: 5, food_freshness: 5, portion_size: 4, food_variety: 4,
        seating_comfort: 5, decor_lighting: 5, ac_comfort: 5, place_cleanliness: 5, restrooms_cleanliness: 5, privacy_quiet: 4,
        music_volume: 4, music_taste: 4, noise_level: 4,
        prep_time: 5, order_accuracy: 5, inquiry_handling: 5,
        value_for_money: 4, pricing_clarity: 5, promotions_loyalty: 4,
        location_convenience: 5, parking_availability: 4, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة خارجية / تراس',
        visit_time: 'فترة السهرة (9 م - 12 ص)',
        beverage_type: 'كولد برو / نيترو',
        positive_highlight: 'التراس الخارجي في بوليفارد الملقا خيالي مع الجو اللطيف، وكيكة التمر مذهلة.',
        improvement_suggestion: 'إضافة سخانات أو مراوح إضافية في التراس للطقس المتقلب.',
        wants_raffle: true,
        customer_name: 'ريم العتيبي',
        customer_phone: '0544190822',
        customer_email: 'reem.otb@gmail.com'
      },
      daysAgo: 3,
      status: 'new'
    },
    {
      branchId: 'branch-2',
      ratings: {
        overall_satisfaction: 2, nps_score: 4, welcome_reception: 3, staff_attitude: 3, barista_knowledge: 4, service_speed: 2,
        coffee_taste: 3, temperature_perfection: 2, presentation_art: 3, menu_variety: 4,
        ordered_food: true, food_taste: 3, food_freshness: 2, portion_size: 3, food_variety: 3,
        seating_comfort: 4, decor_lighting: 4, ac_comfort: 2, place_cleanliness: 3, restrooms_cleanliness: 2, privacy_quiet: 3,
        music_volume: 3, music_taste: 3, noise_level: 2,
        prep_time: 2, order_accuracy: 2, inquiry_handling: 2,
        value_for_money: 2, pricing_clarity: 4, promotions_loyalty: 3,
        location_convenience: 4, parking_availability: 4, payment_smoothness: 4
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'فترة الظهيرة (11 ص - 4 ع)',
        beverage_type: 'أمريكانو / كورتادو',
        positive_highlight: 'موقع الكافيه ممتاز والديكور أنيق.',
        improvement_suggestion: 'القهوة وصلت باردة، والكرواسون كان ناشف وغير طازج، بالإضافة لأن التكييف كان بارد جداً وبشدة.',
        wants_raffle: true,
        customer_name: 'سلطان الدوسري',
        customer_phone: '0556214433',
        customer_email: 'sultan.d@outlook.com'
      },
      daysAgo: 4,
      status: 'in_progress',
      adminNotes: 'تم التواصل مع العميل والاعتذار له وإرسال دعوة مجانية لتجربة الإفطار والقهوة.'
    },
    {
      branchId: 'branch-3',
      ratings: {
        overall_satisfaction: 4, nps_score: 8, welcome_reception: 4, staff_attitude: 4, barista_knowledge: 4, service_speed: 4,
        coffee_taste: 5, temperature_perfection: 5, presentation_art: 4, menu_variety: 4,
        ordered_food: false,
        seating_comfort: 4, decor_lighting: 4, ac_comfort: 4, place_cleanliness: 4, restrooms_cleanliness: 4, privacy_quiet: 4,
        music_volume: 4, music_taste: 4, noise_level: 4,
        prep_time: 4, order_accuracy: 5, inquiry_handling: 4,
        value_for_money: 4, pricing_clarity: 5, promotions_loyalty: 4,
        location_convenience: 4, parking_availability: 2, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'فترة الظهيرة (11 ص - 4 ع)',
        beverage_type: 'قهوة مقطرة V60 حار أو مثلج',
        positive_highlight: 'محصول كولومبي بمعالجة لاهوائية كان أسطوري ونكهات فاكهية واضحة.',
        improvement_suggestion: 'المواقف في العليا صعبة للغاية وقت الدوامات.',
        wants_raffle: false
      },
      daysAgo: 5,
      status: 'resolved'
    },
    {
      branchId: 'branch-1',
      ratings: {
        overall_satisfaction: 5, nps_score: 10, welcome_reception: 5, staff_attitude: 5, barista_knowledge: 5, service_speed: 5,
        coffee_taste: 5, temperature_perfection: 5, presentation_art: 5, menu_variety: 5,
        ordered_food: true, food_taste: 5, food_freshness: 5, portion_size: 5, food_variety: 4,
        seating_comfort: 5, decor_lighting: 5, ac_comfort: 5, place_cleanliness: 5, restrooms_cleanliness: 5, privacy_quiet: 5,
        music_volume: 5, music_taste: 5, noise_level: 5,
        prep_time: 5, order_accuracy: 5, inquiry_handling: 5,
        value_for_money: 4, pricing_clarity: 5, promotions_loyalty: 5,
        location_convenience: 5, parking_availability: 4, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'الصباح الباكر (7 ص - 11 ص)',
        beverage_type: 'فلات وايت / كابتشينو',
        positive_highlight: 'أفضل مقهى مختص بالرياض بدون منازع. التعامل والقهوة والسان سيباستيان خرافية.',
        improvement_suggestion: 'أتمنى فتح فرع في الدرعية قريباً!',
        wants_raffle: true,
        customer_name: 'نورة السبيعي',
        customer_phone: '0501198421',
        customer_email: 'noura.subaie@gmail.com'
      },
      daysAgo: 6,
      status: 'new'
    },
    {
      branchId: 'branch-4',
      ratings: {
        overall_satisfaction: 4, nps_score: 8, welcome_reception: 4, staff_attitude: 4, barista_knowledge: 4, service_speed: 4,
        coffee_taste: 4, temperature_perfection: 4, presentation_art: 5, menu_variety: 4,
        ordered_food: true, food_taste: 4, food_freshness: 4, portion_size: 4, food_variety: 4,
        seating_comfort: 5, decor_lighting: 5, ac_comfort: 4, place_cleanliness: 5, restrooms_cleanliness: 4, privacy_quiet: 4,
        music_volume: 3, music_taste: 4, noise_level: 3,
        prep_time: 4, order_accuracy: 5, inquiry_handling: 4,
        value_for_money: 3, pricing_clarity: 4, promotions_loyalty: 3,
        location_convenience: 5, parking_availability: 5, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة خارجية / تراس',
        visit_time: 'فترة المساء (4 ع - 9 م)',
        beverage_type: 'ماتشا لاتيه / شاي مختص',
        positive_highlight: 'الماتشا طعمها أصلي بدون سكر مبالغ فيه ولونها أخضر زمردي جميل.',
        improvement_suggestion: 'الأسعار مرتفعة قليلاً خصوصاً على المخبوزات والحلويات.',
        wants_raffle: true,
        customer_name: 'هند خالد',
        customer_phone: '0559981273',
        customer_email: 'hind.k@hotmail.com'
      },
      daysAgo: 7,
      status: 'new'
    },
    {
      branchId: 'branch-2',
      ratings: {
        overall_satisfaction: 5, nps_score: 9, welcome_reception: 5, staff_attitude: 5, barista_knowledge: 5, service_speed: 4,
        coffee_taste: 5, temperature_perfection: 5, presentation_art: 5, menu_variety: 5,
        ordered_food: false,
        seating_comfort: 5, decor_lighting: 5, ac_comfort: 4, place_cleanliness: 5, restrooms_cleanliness: 4, privacy_quiet: 5,
        music_volume: 4, music_taste: 5, noise_level: 4,
        prep_time: 4, order_accuracy: 5, inquiry_handling: 5,
        value_for_money: 4, pricing_clarity: 5, promotions_loyalty: 4,
        location_convenience: 5, parking_availability: 5, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'فترة المساء (4 ع - 9 م)',
        beverage_type: 'قهوة مقطرة V60 حار أو مثلج',
        positive_highlight: 'شرح الباريستا لطرق الاستخلاص ونوع التحميص كان ممتع ومحترف جداً.',
        improvement_suggestion: 'أتمنى إتاحة ورش عمل تدريبية لتحضير القهوة في المنزل.',
        wants_raffle: false
      },
      daysAgo: 8,
      status: 'resolved'
    },
    {
      branchId: 'branch-1',
      ratings: {
        overall_satisfaction: 4, nps_score: 7, welcome_reception: 4, staff_attitude: 4, barista_knowledge: 4, service_speed: 3,
        coffee_taste: 5, temperature_perfection: 4, presentation_art: 4, menu_variety: 4,
        ordered_food: true, food_taste: 4, food_freshness: 4, portion_size: 4, food_variety: 4,
        seating_comfort: 4, decor_lighting: 5, ac_comfort: 4, place_cleanliness: 4, restrooms_cleanliness: 3, privacy_quiet: 3,
        music_volume: 3, music_taste: 4, noise_level: 3,
        prep_time: 3, order_accuracy: 4, inquiry_handling: 4,
        value_for_money: 4, pricing_clarity: 4, promotions_loyalty: 3,
        location_convenience: 5, parking_availability: 3, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'فترة السهرة (9 م - 12 ص)',
        beverage_type: 'فلات وايت / كابتشينو',
        positive_highlight: 'جودة البن استثنائية والكوب متناسق للغاية.',
        improvement_suggestion: 'العناية بدورات المياه وقت الذروة محتاجة تكثيف النظافة.',
        wants_raffle: true,
        customer_name: 'طارق الزهراني',
        customer_phone: '0533219088',
        customer_email: 'tariq.z@gmail.com'
      },
      daysAgo: 9,
      status: 'in_progress',
      adminNotes: 'تم وضع جدول تنظيف دوري كل 30 دقيقة لدورات المياه في فترات الذروة.'
    },
    {
      branchId: 'branch-3',
      ratings: {
        overall_satisfaction: 5, nps_score: 10, welcome_reception: 5, staff_attitude: 5, barista_knowledge: 5, service_speed: 5,
        coffee_taste: 5, temperature_perfection: 5, presentation_art: 5, menu_variety: 5,
        ordered_food: true, food_taste: 5, food_freshness: 5, portion_size: 5, food_variety: 4,
        seating_comfort: 5, decor_lighting: 5, ac_comfort: 5, place_cleanliness: 5, restrooms_cleanliness: 5, privacy_quiet: 4,
        music_volume: 4, music_taste: 5, noise_level: 4,
        prep_time: 5, order_accuracy: 5, inquiry_handling: 5,
        value_for_money: 4, pricing_clarity: 5, promotions_loyalty: 5,
        location_convenience: 4, parking_availability: 4, payment_smoothness: 5
      },
      answers: {
        visit_type: 'جلسة داخلية في الصالة',
        visit_time: 'الصباح الباكر (7 ص - 11 ص)',
        beverage_type: 'فلات وايت / كابتشينو',
        positive_highlight: 'تعامل الكاشير كان قمة في الذوق وبداية جميلة ليومي.',
        improvement_suggestion: 'توفير خيارات مخبوزات خالية من الجلوتين.',
        wants_raffle: true,
        customer_name: 'ماجد الغامدي',
        customer_phone: '0566778901',
        customer_email: 'm.ghamdi@live.com'
      },
      daysAgo: 10,
      status: 'resolved'
    }
  ];

  const now = new Date();
  return sampleFeedbacks.map((f, index) => {
    const surveyDate = new Date(now.getTime() - f.daysAgo * 24 * 60 * 60 * 1000 - (index * 3600000));
    
    // Calculate overall average rating from individual ratings
    const ratingValues = Object.entries(f.ratings)
      .filter(([key, val]) => typeof val === 'number' && key !== 'nps_score')
      .map(([_, val]) => val);
    const averageScore = Number((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(2));

    return {
      id: `srv-${1000 + index}`,
      branchId: f.branchId,
      branchName: DEFAULT_BRANCHES.find(b => b.id === f.branchId)?.name || 'الفرع الرئيسي',
      createdAt: surveyDate.toISOString(),
      ratings: f.ratings,
      answers: f.answers,
      averageScore,
      npsScore: f.ratings.nps_score,
      overallSatisfaction: f.ratings.overall_satisfaction,
      durationSeconds: Math.floor(90 + Math.random() * 80), // 1.5 - 2.5 minutes
      status: f.status || 'new',
      adminNotes: f.adminNotes || '',
      voucherCode: `AROMA${Math.floor(1000 + Math.random() * 9000)}`
    };
  });
}

class Database {
  constructor() {
    this.data = null;
    this.mongoConnected = false;
    this.init();
    this.initMongo();
  }

  init() {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }

    if (fs.existsSync(DB_PATH)) {
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.error('Error reading db.json, creating new database:', err);
        this.data = this.createDefaultData();
        this.save();
      }
    } else {
      this.data = this.createDefaultData();
      this.save();
    }
  }

  async initMongo() {
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000
      });
      this.mongoConnected = true;
      console.log('🍃 Connected to MongoDB Atlas cluster (Database: mawal_marrakech)');
      await this.syncWithMongo();
    } catch (err) {
      console.error('⚠️ Could not connect to MongoDB Atlas (using local backup):', err.message);
    }
  }

  async syncWithMongo() {
    try {
      const branchCount = await Branch.countDocuments();
      if (branchCount === 0 && this.data.branches && this.data.branches.length > 0) {
        console.log('🌱 Seeding MongoDB Atlas from local data...');
        for (const s of (this.data.surveys || [])) {
          await Survey.findOneAndUpdate({ id: s.id }, s, { upsert: true });
        }
        for (const b of this.data.branches) {
          await Branch.findOneAndUpdate({ id: b.id }, b, { upsert: true });
        }
        for (const q of this.data.questions) {
          await Question.findOneAndUpdate({ id: q.id }, q, { upsert: true });
        }
        for (const a of this.data.admins) {
          await Admin.findOneAndUpdate({ id: a.id }, a, { upsert: true });
        }
        await Setting.findOneAndUpdate({ key: 'global' }, { ...this.data.settings, key: 'global' }, { upsert: true });
        console.log('✅ MongoDB Atlas seeded successfully.');
      } else {
        // Load latest authoritative data from MongoDB Atlas
        const [mongoSurveys, mongoBranches, mongoQuestions, mongoAdmins, mongoSettings] = await Promise.all([
          Survey.find({}).sort({ createdAt: -1 }).lean(),
          Branch.find({}).lean(),
          Question.find({}).lean(),
          Admin.find({}).lean(),
          Setting.findOne({ key: 'global' }).lean()
        ]);

        this.data.surveys = (mongoSurveys || []).map(s => {
          const { _id, __v, ...rest } = s;
          return rest;
        });
        if (mongoBranches && mongoBranches.length > 0) {
          this.data.branches = mongoBranches.map(b => {
            const { _id, __v, ...rest } = b;
            return rest;
          });
        }
        if (mongoQuestions && mongoQuestions.length > 0) {
          this.data.questions = mongoQuestions.map(q => {
            const { _id, __v, ...rest } = q;
            return rest;
          });
        }
        if (mongoAdmins && mongoAdmins.length > 0) {
          this.data.admins = mongoAdmins.map(a => {
            const { _id, __v, ...rest } = a;
            return rest;
          });
        }
        if (mongoSettings) {
          const { _id, __v, key, ...rest } = mongoSettings;
          this.data.settings = rest;
        }
        this.save();
        console.log(`✅ Loaded ${this.data.surveys.length} surveys & ${this.data.branches.length} branches from MongoDB Atlas.`);
      }
    } catch (err) {
      console.error('Error synchronizing with MongoDB Atlas:', err);
    }
  }

  createDefaultData() {
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('Admin215@#', salt);

    return {
      admins: [
        {
          id: 'admin-1',
          username: 'admin',
          name: 'مدير العمليات والجودة',
          role: 'superadmin',
          passwordHash: hashedPassword,
          createdAt: new Date().toISOString()
        }
      ],
      branches: DEFAULT_BRANCHES,
      questions: DEFAULT_QUESTIONS,
      surveys: generateInitialSurveys(),
      settings: {
        cafeName: 'مقهى موال مراكش',
        cafeSlogan: 'أصالة المذاق المغربي والقهوة المختصة • المدينة المنورة',
        welcomeMessage: 'أهلاً بكم في مقهى موال مراكش بالمدينة المنورة! رأيكم يصنع التميز.. شاركونا تقييمكم لنرتقي بتجربتكم ونكافئكم بخصم فوري ☕',
        discountRewardPercent: 10,
        discountRewardCode: 'MAWAL10',
        googleMapsUrl: 'https://maps.google.com',
        instagramUrl: 'https://instagram.com/mawal_marrakech',
        allowAnonymous: true,
        enableRaffle: true
      }
    };
  }

  save() {
    try {
      const tempPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, DB_PATH);
    } catch (err) {
      console.error('Failed to save db.json:', err);
      // Fallback direct write
      fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2), 'utf8');
    }
  }

  // --- Surveys Methods ---
  getAllSurveys() {
    return this.data.surveys || [];
  }

  getSurveyById(id) {
    return this.data.surveys.find(s => s.id === id);
  }

  addSurvey(surveyData) {
    const newId = `srv-${Date.now()}`;
    const branch = this.data.branches.find(b => b.id === surveyData.branchId) || this.data.branches[0];

    // Compute average rating
    const ratingValues = Object.entries(surveyData.ratings || {})
      .filter(([key, val]) => typeof val === 'number' && key !== 'nps_score')
      .map(([_, val]) => val);
    const averageScore = ratingValues.length > 0 
      ? Number((ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(2)) 
      : 5;

    const voucherCode = `MAWAL${Math.floor(1000 + Math.random() * 9000)}`;

    const newSurvey = {
      id: newId,
      branchId: branch ? branch.id : 'branch-1',
      branchName: branch ? branch.name : 'الفرع الرئيسي',
      createdAt: new Date().toISOString(),
      ratings: surveyData.ratings || {},
      answers: surveyData.answers || {},
      averageScore,
      npsScore: Number(surveyData.ratings?.nps_score ?? 10),
      overallSatisfaction: Number(surveyData.ratings?.overall_satisfaction ?? 5),
      durationSeconds: Number(surveyData.durationSeconds || 120),
      status: 'new',
      adminNotes: '',
      voucherCode
    };

    this.data.surveys.unshift(newSurvey);
    this.save();

    // Async persist to MongoDB Atlas
    Survey.create(newSurvey).catch(err => {
      console.error('MongoDB Atlas Survey.create error:', err.message);
    });

    return newSurvey;
  }

  updateSurveyStatus(id, { status, adminNotes }) {
    const survey = this.data.surveys.find(s => s.id === id);
    if (!survey) return null;
    if (status !== undefined) survey.status = status;
    if (adminNotes !== undefined) survey.adminNotes = adminNotes;
    this.save();

    // Async persist to MongoDB Atlas
    const updates = {};
    if (status !== undefined) updates.status = status;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    Survey.updateOne({ id }, { $set: updates }).catch(err => {
      console.error('MongoDB Atlas Survey.updateOne error:', err.message);
    });

    return survey;
  }

  deleteSurvey(id) {
    const index = this.data.surveys.findIndex(s => s.id === id);
    if (index === -1) return false;
    this.data.surveys.splice(index, 1);
    this.save();

    // Async persist to MongoDB Atlas
    Survey.deleteOne({ id }).catch(err => {
      console.error('MongoDB Atlas Survey.deleteOne error:', err.message);
    });

    return true;
  }

  // --- Questions Methods ---
  getQuestions() {
    return this.data.questions;
  }

  updateQuestions(questions) {
    this.data.questions = questions;
    this.save();

    // Async persist to MongoDB Atlas
    (async () => {
      try {
        await Question.deleteMany({});
        await Question.insertMany(questions);
      } catch (err) {
        console.error('MongoDB Atlas Question update error:', err.message);
      }
    })();

    return this.data.questions;
  }

  // --- Branches Methods ---
  getBranches() {
    return this.data.branches;
  }

  addBranch(branch) {
    const newBranch = {
      id: `branch-${Date.now()}`,
      name: branch.name,
      city: branch.city || 'المدينة المنورة',
      address: branch.address || '',
      whatsappNumber: branch.whatsappNumber || '',
      whatsappDisplay: branch.whatsappDisplay || branch.whatsappNumber || '',
      managerName: branch.managerName || '',
      active: true
    };
    this.data.branches.push(newBranch);
    this.save();

    // Async persist to MongoDB Atlas
    Branch.create(newBranch).catch(err => {
      console.error('MongoDB Atlas Branch.create error:', err.message);
    });

    return newBranch;
  }

  updateBranch(id, updates) {
    const branch = this.data.branches.find(b => b.id === id);
    if (!branch) return null;
    Object.assign(branch, updates);
    this.save();

    // Async persist to MongoDB Atlas
    Branch.updateOne({ id }, { $set: updates }).catch(err => {
      console.error('MongoDB Atlas Branch.updateOne error:', err.message);
    });

    return branch;
  }

  // --- Settings ---
  getSettings() {
    return this.data.settings;
  }

  updateSettings(updates) {
    this.data.settings = { ...this.data.settings, ...updates };
    this.save();

    // Async persist to MongoDB Atlas
    Setting.updateOne({ key: 'global' }, { $set: updates }, { upsert: true }).catch(err => {
      console.error('MongoDB Atlas Setting.updateOne error:', err.message);
    });

    return this.data.settings;
  }

  // --- Admin Auth ---
  findAdminByUsername(username) {
    if (!username) return null;
    return this.data.admins.find(a => (a.username && a.username.toLowerCase() === username.toLowerCase()));
  }

  findAdminByEmail(email) {
    if (!email) return null;
    return this.data.admins.find(a => (a.email && a.email.toLowerCase() === email.toLowerCase()));
  }

  updateAdminPassword(username, newPassword) {
    const admin = this.findAdminByUsername(username);
    if (!admin) return false;
    const salt = bcrypt.genSaltSync(10);
    admin.passwordHash = bcrypt.hashSync(newPassword, salt);
    this.save();

    // Async persist to MongoDB Atlas
    Admin.updateOne({ username: admin.username }, { $set: { passwordHash: admin.passwordHash } }).catch(err => {
      console.error('MongoDB Atlas Admin.updateOne error:', err.message);
    });

    return true;
  }

  updateAdminProfile(currentUsername, { email, name, username, newPassword }) {
    const admin = this.findAdminByUsername(currentUsername);
    if (!admin) return null;

    if (email !== undefined) admin.email = email.trim();
    if (name !== undefined) admin.name = name.trim();
    if (username !== undefined && username.trim()) admin.username = username.trim();
    if (newPassword && newPassword.length >= 6) {
      const salt = bcrypt.genSaltSync(10);
      admin.passwordHash = bcrypt.hashSync(newPassword, salt);
    }

    this.save();

    // Async persist to MongoDB Atlas
    const updatePayload = {
      email: admin.email,
      name: admin.name,
      username: admin.username,
      passwordHash: admin.passwordHash
    };
    Admin.updateOne({ id: admin.id }, { $set: updatePayload }).catch(err => {
      console.error('MongoDB Atlas Admin.updateOne error:', err.message);
    });

    return admin;
  }
}

module.exports = new Database();
