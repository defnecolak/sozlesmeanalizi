'use strict';

const DEFAULT_PROFILE = {
  factor: 1.0,
  gamma: 1.0,
  baseline: 10,
  reviewHint: 'Ödeme, fesih ve sorumluluk dengesini yazılı netleştir.',
  marketLabel: 'Piyasa / Mantık Kontrolü',
  standardRuleAdjust: Object.freeze({})
};

const PACK_PROFILES = {
  genel: {
    factor: 1.0,
    gamma: 1.0,
    baseline: 10,
    reviewHint: 'Toplam maliyet, fesih ve sorumluluk maddelerini yazılı netleştir.'
  },
  hizmet: {
    factor: 1.1,
    gamma: 1.06,
    baseline: 12,
    reviewHint: 'Teslim kriterleri, revizyon limiti ve ödeme kilometre taşlarını netleştir.',
    standardRuleAdjust: {
      unlimited_revisions: 0.95,
      exclusive_jurisdiction: 0.94
    }
  },
  influencer: {
    factor: 1.12,
    gamma: 1.08,
    baseline: 12,
    reviewHint: 'Kullanım süresi, mecra kapsamı ve içerik onay akışını daralt.',
    standardRuleAdjust: {
      ip_assignment: 0.92,
      assignment_unilateral: 0.9
    }
  },
  etkinlik: {
    factor: 1.22,
    gamma: 1.38,
    baseline: 13,
    reviewHint: 'İptal tablosu, kişi garantisi, ek hizmet ücretleri ve etkinlik konusunu yazılı netleştir.',
    marketLabel: 'Maliyet / Piyasa Kontrolü',
    standardRuleAdjust: {
      penalty_clause: 0.84,
      no_refund: 0.86,
      cancel_deadline: 0.88,
      subcontractor_unrestricted: 0.82,
      late_interest_and_costs: 0.9,
      unlimited_liability: 0.82
    }
  },
  kira: {
    factor: 1.18,
    gamma: 1.08,
    baseline: 14,
    reviewHint: 'Depozito, artış ve tahliye şartlarını emsal kira pratiğiyle kıyasla.',
    standardRuleAdjust: {
      notice_portal_only: 0.92,
      exclusive_jurisdiction: 0.95
    }
  },
  satis: {
    factor: 1.1,
    gamma: 1.05,
    baseline: 12,
    reviewHint: 'Teslim, ayıp/garanti ve iade şartlarını emsal satış sözleşmeleriyle kıyasla.',
    standardRuleAdjust: {
      exclusive_jurisdiction: 0.95,
      assignment_unilateral: 0.92
    }
  },
  saas: {
    factor: 1.16,
    gamma: 1.1,
    baseline: 16,
    reviewHint: 'Fiyat değişikliği, veri işleme ve hizmet seviyesi (SLA) maddelerini kontrol et.',
    standardRuleAdjust: {
      auto_renew: 0.9,
      notice_portal_only: 0.9,
      exclusive_jurisdiction: 0.92
    }
  },
  is: {
    factor: 1.1,
    gamma: 1.04,
    baseline: 18,
    reviewHint: 'Ücret, fesih, fazla mesai ve rekabet yasağı dengesini kontrol et.',
    standardRuleAdjust: {
      exclusive_jurisdiction: 0.94
    }
  },
  kredi: {
    factor: 1.12,
    gamma: 1.03,
    baseline: 14,
    reviewHint: 'Muacceliyet, faiz, kefalet ve tahsil masraflarını daraltmaya çalış.',
    standardRuleAdjust: {
      exclusive_jurisdiction: 0.94
    }
  },
  egitim: {
    factor: 1.08,
    gamma: 1.06,
    baseline: 12,
    reviewHint: 'İade, program değişikliği ve devamsızlık kurallarını açıklaştır.',
    standardRuleAdjust: {
      exclusive_jurisdiction: 0.94
    }
  },
  gizlilik: {
    factor: 1.0,
    gamma: 1.0,
    baseline: 10,
    reviewHint: 'Gizli bilgi tanımı, istisnalar, süre ve cezayı orantılı hale getir.',
    standardRuleAdjust: {
      broad_confidentiality: 0.9,
      exclusive_jurisdiction: 0.95
    }
  },
  abonelik: {
    factor: 1.16,
    gamma: 1.08,
    baseline: 14,
    reviewHint: 'Otomatik yenileme, cayma bedeli ve fiyat artışını sadeleştir.',
    standardRuleAdjust: {
      abonelik_otomatik_yenileme: 0.88,
      notice_portal_only: 0.88,
      exclusive_jurisdiction: 0.94
    }
  },
  arac: {
    factor: 1.18,
    gamma: 1.09,
    baseline: 14,
    reviewHint: 'Hasar, km aşımı, depozito ve sigorta detaylarını teslim tutanağıyla eşleştir.',
    standardRuleAdjust: {
      arac_km_limit_asim: 0.9,
      exclusive_jurisdiction: 0.94
    }
  },
  seyahat: {
    factor: 1.18,
    gamma: 1.1,
    baseline: 14,
    reviewHint: 'İptal/iade pencereleri ile program değişikliği koşullarını yazılı netleştir.',
    standardRuleAdjust: {
      seyahat_program_degisebilir: 0.9,
      exclusive_jurisdiction: 0.94
    }
  },
  sigorta: {
    factor: 1.22,
    gamma: 1.08,
    baseline: 14,
    reviewHint: 'İstisnalar, muafiyet, ihbar süresi ve prim artışı şartlarını tek tek kontrol et.',
    standardRuleAdjust: {
      sigorta_genis_istisna: 0.92,
      exclusive_jurisdiction: 0.94
    }
  }
};

function getPackProfile(packKey) {
  const key = String(packKey || 'genel').toLowerCase();
  const p = PACK_PROFILES[key] || PACK_PROFILES.genel;
  return {
    ...DEFAULT_PROFILE,
    ...p,
    standardRuleAdjust: {
      ...DEFAULT_PROFILE.standardRuleAdjust,
      ...(p.standardRuleAdjust || {})
    }
  };
}

module.exports = {
  PACK_PROFILES,
  getPackProfile
};
