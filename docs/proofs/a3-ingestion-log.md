# A3 — استيراد حيّ من كتالوج الويب (أسواق التميمي)

المحوّل: `server/src/adapters/tamimiStorefront.ts` — يستدعي واجهة JSON العامة
`shop.tamimimarkets.com/api/product` (نفس ما يستخدمه المتصفح) بمعدل مهذّب وهوية واضحة.
السعر من `variants[].storeSpecificData[].mrp` (مع الخصم)، والصورة من `variants[].images`،
ومسار التصنيف من سلسلة `primaryCategory`.

## نُفِّذ حيّاً داخل البيئة (ليس وعداً)

### 1) تشغيل تجريبي (يثبت الوصول دون كتابة)
```
$ npm run ingest -- --store=tamimi --city=makkah --dry-run --limit=2 --categories=bakery,dairy
  زحف bakery ص1: 20 منتجاً
  زحف bakery ص2: 20 منتجاً
  زحف dairy ص1: 20 منتجاً
  زحف dairy ص2: 20 منتجاً
اكتمل الزحف: 4 صفحة، 80 منتجاً (80 بصورة)
وضع تجريبي — لا كتابة للقاعدة.
=> { pagesCrawled: 4, productsFound: 80, withImage: 80, branches: 2 }
```

### 2) تشغيل حقيقي (كتب أسعاراً وأدلّة فعلية)
```
$ npm run ingest -- --store=tamimi --city=makkah --limit=1 --categories=bakery
اكتمل الزحف: 1 صفحة، 20 منتجاً (20 بصورة)
اكتمل: 38 سعراً، 19 صورة، 38 دليلاً، 13 منتجاً جديداً
=> {
     pagesCrawled: 1, productsFound: 20, withImage: 20,
     imagesDownloaded: 19, pricesWritten: 38, evidenceCreated: 38,
     autoCreated: 13, branches: 2, errors: 0
   }
```

تحقّق القاعدة بعدها:
- أسعار حقيقية (`is_demo=false`): **38**
- صفوف دليل `product_image`: **38** (منها 36 بصورة محلية مُنزَّلة بهاش المحتوى)
- مثال صف دليل: `image_path=…webp`, `source_url=https://shop.tamimimarkets.com/en/product/mini-stick-borek-potato-vegan`

### 3) إثبات السعر يعرض صورة مصدر حقيقية
انظر `docs/proofs/a3-evidence-real-source-image.png`: لوحة «إثبات السعر» لمنتج حقيقي
("Arabic Bread White" من كتالوج التميمي) تعرض **صورة المنتج من موقع المتجر** على خزّان أبيض،
نوع الدليل «صورة المنتج من موقع المتجر»، وزر «فتح المصدر» يفتح صفحة المنتج الحقيقية.
هذا يُنهي مشكلة «سعر مُدخل يدوياً».

## أوامر لتشغيله بنطاق أوسع (من جهازك أو وظيفة Railway)

```bash
# تجريبي على كل التصنيفات العليا (يثبت الوصول ويعدّ فقط)
npm run ingest -- --store=tamimi --city=makkah --dry-run

# استيراد كامل لمدينة (كل التصنيفات، كل الصفحات) — قد يستغرق وقتاً
npm run ingest -- --store=tamimi --city=makkah

# تصنيفات محددة وحد صفحات لكل تصنيف
npm run ingest -- --store=tamimi --city=jeddah --categories=bakery,dairy,grocery --limit=10
```

> التصنيفات العليا المكتشفة من الواجهة: `fresh (2424)`, `household (2343)`,
> `healthy-living (1432)`, `grocery (1242)`, `dairy (1002)`, `breakfast (790)`,
> `canned-food (396)`, `bakery (301)` — إجمالي > 10 آلاف منتج متاح للزحف.

## ملاحظة امتثال
يستدعي نقاط JSON العامة نفسها التي يستخدمها متصفح الزائر، بمهلة بين الطلبات (700مللي)
وهوية `WaffirBot/1.0`. يفشل بهدوء. للنشر التجاري المتكرر يُستحسن مراجعة شروط الاستخدام
أو اتفاق بيانات مع السلسلة.
