// بيانات الجغرافيا الأولية: مدن، سلاسل متاجر، فروع (القسم 8 — البذر)

export interface SeedCity {
  nameAr: string;
  code: string;
  lat: number;
  lng: number;
  // صندوق الإحاطة اختياري — يلزم فقط لاكتشاف المتاجر؛ غيابه = ±0.05 درجة
  minLat?: number;
  minLng?: number;
  maxLat?: number;
  maxLng?: number;
}

export const CITIES: SeedCity[] = [
  {
    nameAr: 'مكة المكرمة',
    code: 'makkah',
    lat: 21.4225,
    lng: 39.8262,
    minLat: 21.3,
    minLng: 39.7,
    maxLat: 21.52,
    maxLng: 39.95,
  },
  {
    nameAr: 'جدة',
    code: 'jeddah',
    lat: 21.4858,
    lng: 39.1925,
    minLat: 21.3,
    minLng: 39.05,
    maxLat: 21.8,
    maxLng: 39.35,
  },
  {
    nameAr: 'الرياض',
    code: 'riyadh',
    lat: 24.7136,
    lng: 46.6753,
    minLat: 24.45,
    minLng: 46.4,
    maxLat: 25.05,
    maxLng: 47.0,
  },
  // منطقة المدينة المنورة
  { nameAr: 'المدينة المنورة', code: 'madinah', lat: 24.5247, lng: 39.5692 },
  { nameAr: 'ينبع', code: 'yanbu', lat: 24.0895, lng: 38.0618 },
  { nameAr: 'العلا', code: 'alula', lat: 26.6088, lng: 37.9216 },
  // المنطقة الشرقية
  { nameAr: 'الدمام', code: 'dammam', lat: 26.4207, lng: 50.0888 },
  { nameAr: 'الخبر', code: 'khobar', lat: 26.2172, lng: 50.1971 },
  { nameAr: 'الظهران', code: 'dhahran', lat: 26.2361, lng: 50.0393 },
  { nameAr: 'الأحساء', code: 'ahsa', lat: 25.3647, lng: 49.5747 },
  { nameAr: 'القطيف', code: 'qatif', lat: 26.5196, lng: 50.0115 },
  { nameAr: 'الجبيل', code: 'jubail', lat: 27.0046, lng: 49.6225 },
  { nameAr: 'حفر الباطن', code: 'hafar-albatin', lat: 28.4328, lng: 45.9601 },
  { nameAr: 'الخفجي', code: 'khafji', lat: 28.4391, lng: 48.4912 },
  { nameAr: 'رأس تنورة', code: 'ras-tanura', lat: 26.6444, lng: 50.1583 },
  { nameAr: 'بقيق', code: 'buqayq', lat: 25.9335, lng: 49.6661 },
  // منطقة مكة المكرمة (بقية المدن)
  { nameAr: 'الطائف', code: 'taif', lat: 21.2703, lng: 40.4158 },
  { nameAr: 'رابغ', code: 'rabigh', lat: 22.7986, lng: 39.0349 },
  { nameAr: 'القنفذة', code: 'qunfudhah', lat: 19.1264, lng: 41.0789 },
  { nameAr: 'الليث', code: 'allith', lat: 20.1503, lng: 40.2696 },
  // منطقة القصيم
  { nameAr: 'بريدة', code: 'buraidah', lat: 26.326, lng: 43.975 },
  { nameAr: 'عنيزة', code: 'unaizah', lat: 26.0843, lng: 43.9935 },
  { nameAr: 'الرس', code: 'arrass', lat: 25.8694, lng: 43.4973 },
  { nameAr: 'المذنب', code: 'mithnab', lat: 25.8601, lng: 44.2223 },
  { nameAr: 'البكيرية', code: 'bukayriyah', lat: 26.1395, lng: 43.6586 },
  // منطقة حائل
  { nameAr: 'حائل', code: 'hail', lat: 27.5114, lng: 41.69 },
  // منطقة تبوك
  { nameAr: 'تبوك', code: 'tabuk', lat: 28.3838, lng: 36.555 },
  { nameAr: 'ضباء', code: 'duba', lat: 27.3513, lng: 35.6901 },
  { nameAr: 'حقل', code: 'haql', lat: 29.2861, lng: 34.9404 },
  { nameAr: 'أملج', code: 'umluj', lat: 25.0213, lng: 37.2685 },
  { nameAr: 'تيماء', code: 'tayma', lat: 27.6285, lng: 38.553 },
  // منطقة الحدود الشمالية
  { nameAr: 'عرعر', code: 'arar', lat: 30.9753, lng: 41.0381 },
  { nameAr: 'رفحاء', code: 'rafha', lat: 29.6262, lng: 43.4947 },
  { nameAr: 'طريف', code: 'turaif', lat: 31.6726, lng: 38.6637 },
  // منطقة الجوف
  { nameAr: 'سكاكا', code: 'sakaka', lat: 29.9697, lng: 40.2064 },
  { nameAr: 'القريات', code: 'qurayyat', lat: 31.332, lng: 37.3429 },
  { nameAr: 'دومة الجندل', code: 'dumat-aljandal', lat: 29.8117, lng: 39.8682 },
  // منطقة عسير
  { nameAr: 'أبها', code: 'abha', lat: 18.2164, lng: 42.5053 },
  { nameAr: 'خميس مشيط', code: 'khamis-mushait', lat: 18.306, lng: 42.7297 },
  { nameAr: 'بيشة', code: 'bisha', lat: 19.9764, lng: 42.5902 },
  { nameAr: 'النماص', code: 'namas', lat: 19.1166, lng: 42.15 },
  { nameAr: 'محايل عسير', code: 'muhayil', lat: 18.55, lng: 42.05 },
  // منطقة نجران
  { nameAr: 'نجران', code: 'najran', lat: 17.4924, lng: 44.1277 },
  { nameAr: 'شرورة', code: 'sharurah', lat: 17.483, lng: 47.1167 },
  // منطقة جازان
  { nameAr: 'جازان', code: 'jazan', lat: 16.8892, lng: 42.5511 },
  { nameAr: 'صبيا', code: 'sabya', lat: 17.1495, lng: 42.6254 },
  { nameAr: 'أبو عريش', code: 'abu-arish', lat: 16.969, lng: 42.8322 },
  { nameAr: 'صامطة', code: 'samtah', lat: 16.5979, lng: 42.9445 },
  // منطقة الباحة
  { nameAr: 'الباحة', code: 'albaha', lat: 20.0129, lng: 41.4677 },
  { nameAr: 'بلجرشي', code: 'baljurashi', lat: 19.8567, lng: 41.5566 },
  // منطقة الرياض (بقية المدن)
  { nameAr: 'الخرج', code: 'kharj', lat: 24.1554, lng: 47.3346 },
  { nameAr: 'المجمعة', code: 'majmaah', lat: 25.9038, lng: 45.3458 },
  { nameAr: 'الزلفي', code: 'zulfi', lat: 26.2996, lng: 44.8156 },
  { nameAr: 'شقراء', code: 'shaqra', lat: 25.24, lng: 45.2519 },
  { nameAr: 'الدوادمي', code: 'dawadmi', lat: 24.5072, lng: 44.3924 },
  { nameAr: 'عفيف', code: 'afif', lat: 23.9065, lng: 42.9176 },
  { nameAr: 'وادي الدواسر', code: 'wadi-aldawasir', lat: 20.4711, lng: 44.7958 },
  { nameAr: 'ليلى (الأفلاج)', code: 'layla', lat: 22.2833, lng: 46.7333 },
  { nameAr: 'حوطة بني تميم', code: 'hawtat-bani-tamim', lat: 23.5167, lng: 46.85 },
  { nameAr: 'الغاط', code: 'ghat', lat: 26.0269, lng: 44.9603 },
];

export interface SeedStore {
  nameAr: string;
  slug: string;
  type: 'supermarket' | 'grocery' | 'specialty';
}

export const STORES: SeedStore[] = [
  { nameAr: 'بنده', slug: 'panda', type: 'supermarket' },
  { nameAr: 'العثيم', slug: 'othaim', type: 'supermarket' },
  { nameAr: 'الدانوب', slug: 'danube', type: 'supermarket' },
  { nameAr: 'كارفور', slug: 'carrefour', type: 'supermarket' },
  { nameAr: 'التميمي', slug: 'tamimi', type: 'supermarket' },
  { nameAr: 'بقالة البركة', slug: 'baraka', type: 'grocery' },
];

export interface SeedBranch {
  store: string; // slug
  city: string; // code
  nameAr: string;
  address: string;
  lat: number;
  lng: number;
}

// إحداثيات تقريبية لأحياء حقيقية في مكة وجدة
export const BRANCHES: SeedBranch[] = [
  // بنده
  { store: 'panda', city: 'makkah', nameAr: 'بنده - العزيزية', address: 'حي العزيزية، طريق الملك عبدالله، مكة المكرمة', lat: 21.4051, lng: 39.8752 },
  { store: 'panda', city: 'makkah', nameAr: 'هايبر بنده - النسيم', address: 'حي النسيم، الدائري الثالث، مكة المكرمة', lat: 21.4602, lng: 39.8631 },
  { store: 'panda', city: 'jeddah', nameAr: 'بنده - الروضة', address: 'حي الروضة، شارع الأمير سعود الفيصل، جدة', lat: 21.5704, lng: 39.1312 },
  { store: 'panda', city: 'jeddah', nameAr: 'هايبر بنده - الصفا', address: 'حي الصفا، شارع الأمير متعب، جدة', lat: 21.5901, lng: 39.2104 },
  // العثيم
  { store: 'othaim', city: 'makkah', nameAr: 'أسواق العثيم - الششة', address: 'حي الششة، شارع الحج، مكة المكرمة', lat: 21.4353, lng: 39.8662 },
  { store: 'othaim', city: 'makkah', nameAr: 'أسواق العثيم - العوالي', address: 'حي العوالي، طريق الليث، مكة المكرمة', lat: 21.3712, lng: 39.8281 },
  { store: 'othaim', city: 'jeddah', nameAr: 'أسواق العثيم - السلامة', address: 'حي السلامة، شارع صاري، جدة', lat: 21.5923, lng: 39.1441 },
  { store: 'othaim', city: 'jeddah', nameAr: 'أسواق العثيم - البوادي', address: 'حي البوادي، شارع الأمير ماجد، جدة', lat: 21.6012, lng: 39.1623 },
  // الدانوب
  { store: 'danube', city: 'makkah', nameAr: 'الدانوب - الزاهر', address: 'حي الزاهر، شارع جبل الكعبة، مكة المكرمة', lat: 21.4412, lng: 39.8023 },
  { store: 'danube', city: 'makkah', nameAr: 'الدانوب - جرول', address: 'حي جرول، طريق المنصور، مكة المكرمة', lat: 21.4253, lng: 39.8154 },
  { store: 'danube', city: 'jeddah', nameAr: 'الدانوب - الحمراء', address: 'حي الحمراء، طريق الكورنيش، جدة', lat: 21.5021, lng: 39.1631 },
  { store: 'danube', city: 'jeddah', nameAr: 'الدانوب - الفيصلية', address: 'حي الفيصلية، شارع حراء، جدة', lat: 21.5612, lng: 39.1812 },
  // كارفور
  { store: 'carrefour', city: 'makkah', nameAr: 'كارفور - مكة مول', address: 'مكة مول، الدائري الثالث، حي الرصيفة، مكة المكرمة', lat: 21.4221, lng: 39.7942 },
  { store: 'carrefour', city: 'makkah', nameAr: 'كارفور - بطحاء قريش', address: 'حي بطحاء قريش، طريق الطائف، مكة المكرمة', lat: 21.3724, lng: 39.8613 },
  { store: 'carrefour', city: 'jeddah', nameAr: 'كارفور - الرحاب', address: 'حي الرحاب، شارع التحلية، جدة', lat: 21.5511, lng: 39.2103 },
  { store: 'carrefour', city: 'jeddah', nameAr: 'كارفور - النزهة', address: 'حي النزهة، شارع الأمير سلطان، جدة', lat: 21.6204, lng: 39.1512 },
  // التميمي
  { store: 'tamimi', city: 'makkah', nameAr: 'التميمي - الشوقية', address: 'حي الشوقية، طريق جدة القديم، مكة المكرمة', lat: 21.3815, lng: 39.7831 },
  { store: 'tamimi', city: 'makkah', nameAr: 'التميمي - النسيم', address: 'حي النسيم، شارع الحرس الوطني، مكة المكرمة', lat: 21.4641, lng: 39.8702 },
  { store: 'tamimi', city: 'jeddah', nameAr: 'التميمي - المروة', address: 'حي المروة، شارع حراء، جدة', lat: 21.6112, lng: 39.2034 },
  { store: 'tamimi', city: 'jeddah', nameAr: 'التميمي - الزهراء', address: 'حي الزهراء، شارع الأمير سلطان، جدة', lat: 21.5803, lng: 39.1242 },
  // بقالة البركة (بقالات حي — مصدر "مستخدمون فقط")
  { store: 'baraka', city: 'makkah', nameAr: 'بقالة البركة - الكعكية', address: 'حي الكعكية، شارع إبراهيم الخليل، مكة المكرمة', lat: 21.3902, lng: 39.8051 },
  { store: 'baraka', city: 'makkah', nameAr: 'بقالة البركة - العزيزية الجنوبية', address: 'حي العزيزية الجنوبية، مكة المكرمة', lat: 21.3961, lng: 39.8812 },
  { store: 'baraka', city: 'jeddah', nameAr: 'بقالة البركة - البوادي', address: 'حي البوادي، جدة', lat: 21.6043, lng: 39.1672 },
  { store: 'baraka', city: 'jeddah', nameAr: 'بقالة البركة - الصفا', address: 'حي الصفا، جدة', lat: 21.5872, lng: 39.2151 },
];
