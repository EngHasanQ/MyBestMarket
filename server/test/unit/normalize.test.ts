import { describe, expect, it } from 'vitest';
import { chainKey, normalizeArabic, similarity } from '../../src/services/normalize.js';

describe('normalizeArabic', () => {
  it('يوحّد الهمزات والتاء المربوطة', () => {
    expect(normalizeArabic('أرز')).toBe('ارز');
    expect(normalizeArabic('إبريق')).toBe('ابريق');
    expect(normalizeArabic('آسيا')).toBe('اسيا');
    expect(normalizeArabic('جبنة')).toBe('جبنه');
  });

  it('يزيل التشكيل والتطويل', () => {
    expect(normalizeArabic('حَلِيبٌ')).toBe('حليب');
    expect(normalizeArabic('شـــاي')).toBe('شاي');
  });

  it('يحوّل الأرقام الهندية إلى لاتينية', () => {
    expect(normalizeArabic('أرز ٥ كجم')).toBe('ارز 5 كجم');
    expect(normalizeArabic('زيت ١.٥ لتر')).toBe('زيت 1.5 لتر');
  });

  it('يزيل الرموز ويوحّد الفراغات', () => {
    expect(normalizeArabic('  حليب - المراعي  (٢ لتر)! ')).toBe('حليب المراعي 2 لتر');
  });

  it('يحافظ على الفاصلة العشرية داخل الأرقام', () => {
    expect(normalizeArabic('سعر 12,50')).toBe('سعر 12.50');
  });
});

describe('similarity', () => {
  it('تطابق تام = 1', () => {
    expect(similarity('أرز أبو كاس', 'ارز ابو كاس')).toBe(1);
  });

  it('أسماء متقاربة تتجاوز العتبة', () => {
    expect(similarity('ارز ابو كاس بسمتي 5 كجم', 'أرز أبو كاس ٥ كجم')).toBeGreaterThan(0.6);
  });

  it('أسماء مختلفة منخفضة', () => {
    expect(similarity('شاي ليبتون', 'صابون فيري')).toBeLessThan(0.3);
  });
});

describe('chainKey', () => {
  it('يجمع فروع السلسلة على مفتاح واحد', () => {
    expect(chainKey('بنده - حي الروضة')).toBe(chainKey('بنده - العزيزية'));
    expect(chainKey('أسواق المرشدي - العوالي')).toBe(chainKey('اسواق المرشدي فرع الششة'));
  });

  it('يتجاهل الكلمات العامة مثل هايبر وماركت', () => {
    expect(chainKey('هايبر بنده')).toBe(chainKey('بنده ماركت'));
  });
});
