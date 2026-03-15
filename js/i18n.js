// Simple i18n system for Stones Map
class I18n {
  constructor() {
    this.translations = {};
    this.currentLang = this.getStoredLanguage() || this.detectLanguage();
    this.supportedLanguages = ['lv', 'en'];
  }

  // Detect browser language, default to Latvian
  detectLanguage() {
    try {
      if (!navigator.language) return 'lv';
      const browserLang = navigator.language.toLowerCase().split('-')[0];
      return this.supportedLanguages.includes(browserLang) ? browserLang : 'lv';
    } catch (e) {
      console.warn('[i18n] Language detection failed:', e);
      return 'lv';
    }
  }

  // Get stored language from localStorage
  getStoredLanguage() {
    return localStorage.getItem('language');
  }

  // Set and store language
  async setLanguage(lang) {
    if (!this.supportedLanguages.includes(lang)) {
      console.warn(`[i18n] Language ${lang} not supported, using default`);
      lang = 'lv';
    }

    this.currentLang = lang;
    localStorage.setItem('language', lang);

    await this.loadLanguage(lang);
    this.updatePageLanguage();

    return lang;
  }

  // Load language file
  async loadLanguage(lang) {
    try {
      const response = await fetch(`/lang/${lang}.json`);
      if (!response.ok) throw new Error(`Failed to load ${lang}.json`);

      this.translations = await response.json();
      console.log(`[i18n] Loaded ${lang} translations`);

      return this.translations;
    } catch (error) {
      console.error(`[i18n] Error loading ${lang}:`, error);

      // Fallback to Latvian if English fails
      if (lang !== 'lv') {
        console.log('[i18n] Falling back to Latvian');
        return this.loadLanguage('lv');
      }

      return {};
    }
  }

  // Get translation by key path (e.g., "app.title")
  t(keyPath, replacements = {}) {
    const keys = keyPath.split('.');
    let value = this.translations;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        console.warn(`[i18n] Translation key not found: ${keyPath}`);
        return keyPath; // Return key if translation not found
      }
    }

    // Replace placeholders like {name} with values
    if (typeof value === 'string' && Object.keys(replacements).length > 0) {
      return value.replace(/\{(\w+)\}/g, (match, key) => {
        return replacements[key] !== undefined ? replacements[key] : match;
      });
    }

    return value;
  }

  // Update page language attribute
  updatePageLanguage() {
    document.documentElement.setAttribute('lang', this.currentLang);
  }

  // Get current language
  getCurrentLanguage() {
    return this.currentLang;
  }

  // Get all supported languages
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  // Toggle between languages
  toggleLanguage() {
    const currentIndex = this.supportedLanguages.indexOf(this.currentLang);
    const nextIndex = (currentIndex + 1) % this.supportedLanguages.length;
    const nextLang = this.supportedLanguages[nextIndex];

    return this.setLanguage(nextLang);
  }
}

// Create global instance
window.i18n = new I18n();

// Shorthand for translation
window.t = (key, replacements) => window.i18n.t(key, replacements);
