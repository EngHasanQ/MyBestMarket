import 'dotenv/config';

// كل العتبات القابلة للضبط في مكان واحد (القسم 6.5 من المواصفة)
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://waffir:waffir@localhost:5432/waffir',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  appOrigin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  isProd: process.env.NODE_ENV === 'production',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',

  // سياسة قِدم الأسعار (القسم 2.5)
  staleDays: 14,
  staleOfferDays: 7,

  // درجات الثقة الأساسية لكل مصدر (القسمان 2.4 و14)
  baseConfidence: {
    receipt_ocr: 99,
    user_report: 90,
    flyer_ocr_verified: 95,
    manual_admin: 95,
    api: 80,
    scrape: 80,
  } as Record<string, number>,
  // تَناقُص الثقة: نقاط تُخصم لكل يوم منذ آخر تحقق
  confidenceDecayPerDay: 5,
  // أدنى ثقة تُقبل في ترشيحات "الأرخص" (القسم 6.3)
  minConfidenceForCheapest: 70,

  // حارس الشذوذ: انحراف > 40% عن الوسيط يذهب لقائمة المراجعة (القسم 14.5)
  anomalyDeviation: 0.4,

  // توليد القائمة الشهرية قبل يوم التسوق بـ N أيام (القسم 5-B)
  listLeadDays: 3,
  // نافذة ضم المنتج للقائمة: [يوم التسوق - 7 ، يوم التسوق + الفاصل/2]
  listWindowBeforeDays: 7,

  // كشف أفضل وقت للشراء: ≥3 تكرارات في نفس الدلو خلال 6 أشهر (القسم 6.4)
  bestTimeMinOccurrences: 3,
  bestTimeLookbackMonths: 6,

  // الاكتشاف: حجم خلية الشبكة بالدرجات (~2كم) والاكتشاف شهري (القسم 13)
  discoveryGridStep: 0.02,

  // المعايرة: نافذة مطابقة سعر إلكتروني/رف بالأيام (القسم 14.5)
  calibrationWindowDays: 7,

  bcryptRounds: 12,
};
