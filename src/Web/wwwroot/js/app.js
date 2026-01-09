(function () {
  console.log('app.js script yüklendi ve çalışıyor');
  const apiMeta = document.querySelector('meta[name="api-base"]');
  const apiBase = (apiMeta && apiMeta.content && apiMeta.content.trim().length > 0)
    ? apiMeta.content.trim()
    : 'http://localhost:8081';
  let initVendorDashboardImpl = null;
  const vendorDashboardInitWaiters = [];
  window.__vendorDashboardInitRequested = false;
  window.initVendorDashboard = async function() {
    if (initVendorDashboardImpl) {
      return await initVendorDashboardImpl();
    }
    console.warn('initVendorDashboard henüz hazır değil, DOM yüklenmesini bekliyoruz.');
    window.__vendorDashboardInitRequested = true;
    return new Promise(resolve => vendorDashboardInitWaiters.push(resolve));
  };
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const fmt = new Intl.NumberFormat('tr-TR');
  const VISIBILITY_META = {
    0: { text: 'Gizli', class: 'status-passive' },
    1: { text: 'Aktif', class: 'status-active' },
    2: { text: 'Silinmiş', class: 'status-deleted' }
  };
  const MAX_VENDOR_PHOTOS = 10;
  let serviceToggleCollapsedLabel = '+ Hizmet Ekle';
  const pageParams = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const vendorDashboardInitialTab = pageParams ? pageParams.get('tab') : null;
  let vendorDashboardFocusListingId = pageParams ? pageParams.get('focus') : null;
  let loadOpen = null;
  let loadMyBids = null;

  function clearVendorDashboardQueryParams() {
    if (!pageParams || !window.history || typeof window.history.replaceState !== 'function') return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('tab');
      url.searchParams.delete('focus');
      const newSearch = url.searchParams.toString();
      const newUrl = url.pathname + (newSearch ? `?${newSearch}` : '') + url.hash;
      window.history.replaceState({}, '', newUrl);
    } catch (err) {
      console.warn('Vendor query cleanup failed:', err.message);
    }
  }

  function token() { return localStorage.getItem('token') || ''; }
  function role() { return localStorage.getItem('role') || ''; }
  function displayName() { return localStorage.getItem('displayName') || ''; }
  function userId() { return localStorage.getItem('userId') || ''; }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizePlaceKey(name) {
    let s = String(name || '').trim().toLowerCase();
    if (!s) return '';

    // Turkish specific
    s = s
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');

    // Strip diacritics (NFKD)
    try {
      s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    } catch (_) {
      // ignore if normalize isn't supported
    }

    // Keep alnum, collapse others
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return s;
  }

  let placePhotosManifestPromise = null;
  function getPlacePhotosManifest() {
    if (placePhotosManifestPromise) return placePhotosManifestPromise;
    placePhotosManifestPromise = fetch('/img/place-photos/manifest.json', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
    return placePhotosManifestPromise;
  }

  function googlePlacePhotoUrl(photoReference, maxWidth) {
    const ref = String(photoReference || '').trim();
    if (!ref) return '';
    const w = Number(maxWidth) || 640;
    return `${apiBase}/api/google-places/photo?photoRef=${encodeURIComponent(ref)}&maxWidth=${encodeURIComponent(String(w))}`;
  }

  function localCategoryBaseName(category) {
    const key = String(category || '').toLowerCase();
    const filename = (
      key === 'wedding' ? 'wedding' :
      key === 'bakery' ? 'bakery' :
      key === 'florist' ? 'florist' :
      key === 'photographer' ? 'photographer' :
      key === 'restaurant' ? 'restaurant' :
      'venue'
    );
    return filename;
  }

  function localCategoryAssetUrl(category, ext) {
    const base = localCategoryBaseName(category);
    const safeExt = String(ext || 'svg').toLowerCase();
    return `/img/categories/${base}.${safeExt}`;
  }

  function createCategoryImageElement(category, photoReference, width, height, className, altText) {
    const img = document.createElement('img');
    if (className) img.className = className;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = altText || 'Mekan görseli';

    const w = Number(width) || 640;
    const googleUrl = googlePlacePhotoUrl(photoReference, w);
    const localSvg = localCategoryAssetUrl(category, 'svg');

    const placeKey = normalizePlaceKey(altText);
    const setInitialSrc = () => {
      img.src = googleUrl || localSvg || localCategoryAssetUrl('venue', 'svg');
    };

    // Always set a placeholder immediately (avoid empty src while manifest loads).
    setInitialSrc();

    img.onerror = () => {
      img.onerror = null;
      img.src = localSvg || localCategoryAssetUrl('venue', 'svg');
    };

    // Prefer local cached place photo when available (no external API).
    if (placeKey) {
      getPlacePhotosManifest().then(manifest => {
        const path = manifest && manifest.items && manifest.items[placeKey] && manifest.items[placeKey].path;
        if (path) {
          // Cache-bust on replacements: manifest is fetched with `no-store` and `generatedAtUtc`
          // changes after each upload, so use it as a stable version key.
          const v = (manifest && manifest.generatedAtUtc) ? String(manifest.generatedAtUtc) : String(Date.now());
          img.src = path + (String(path).includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(v);
        }
      });
    }

    return img;
  }

  function dashboardPathForRole(r) {
    if (r === 'Vendor') return '/Vendor/Dashboard';
    if (r === 'Admin') return '/Admin/Dashboard';
    return '/User/Dashboard';
  }

  function setAuthUI() {
    const r = role();
    const isLoggedIn = !!token();
    const isUser = r === 'User';
    const isVendor = r === 'Vendor';
    const isAdmin = r === 'Admin';
    $$('.only-user').forEach(el => el.style.display = isUser ? 'inline-block' : 'none');
    $$('.only-vendor').forEach(el => el.style.display = isVendor ? 'inline-block' : 'none');
    $$('.only-admin').forEach(el => el.style.display = isAdmin ? 'inline-block' : 'none');
    $$('.only-guest').forEach(el => el.style.display = isLoggedIn ? 'none' : 'inline-block');
    const logout = $('#logoutBtn');
    if (logout) logout.style.display = isLoggedIn ? 'inline-block' : 'none';
  }

  async function api(path, opts={}){
    const isFormData = opts && opts.body instanceof FormData;
    const headers = Object.assign({}, opts.headers || {});
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    const res = await fetch(apiBase + path, Object.assign({}, opts, { headers }));
    if (!res.ok) {
      // Token geçersizse veya süresi dolmuşsa localStorage'ı temizle
      if (res.status === 401) {
        localStorage.clear();
        setAuthUI();
      }
      let errText = 'İşlem başarısız.';
      try { 
        const body = await res.json(); 
        // Farklı hata formatlarını kontrol et
        if (body && body.error) errText = body.error;
        else if (body && body.detail) errText = body.detail;
        else if (body && body.title) errText = body.title;
        else if (body && typeof body === 'string') errText = body;
        else if (body) errText = JSON.stringify(body);
      } catch(e) {
        errText = `HTTP ${res.status}: ${res.statusText}`;
      }
      throw new Error(errText);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return await res.json();
    return await res.text();
  }

  function listingCard(l, isCarousel = false, options = {}){
    const d = new Date(l.eventDate);
    // Show first 2 categories as badges
    const cats = l.items.slice(0, 2).map(i => `<span class="badge">${i.categoryName}</span>`).join(' ');
    const more = l.items.length > 2 ? `<span class="badge">+${l.items.length - 2}</span>` : '';
    const isVendorLoggedIn = !!token() && role() === 'Vendor';
    const { usePazarModal = false } = options || {};
    const bidHref = isVendorLoggedIn
      ? `/Vendor/Dashboard?tab=listings&focus=${l.id}`
      : '/Auth/Login';
    let bidButtonHtml = '';
    if (usePazarModal) {
      bidButtonHtml = isVendorLoggedIn
        ? `<button type="button" class="btn small primary" data-open-pazar-bid="${l.id}">Teklif Ver</button>`
        : `<a class="btn small" href="/Auth/Login" onclick="event.stopPropagation()">Giriş Yap</a>`;
    } else {
      bidButtonHtml = `<a class="btn small" href="${bidHref}" onclick="event.stopPropagation()">Teklif Ver</a>`;
    }
    
    const cardClass = isCarousel ? 'card listing-card carousel-card' : 'card listing-card';
    const clickHandler = isCarousel ? `onclick="window.location.href='/Listings/Detail?id=${l.id}'"` : '';
    
    return `
      <div class="${cardClass}" ${clickHandler} style="cursor: ${isCarousel ? 'pointer' : 'default'}">
        <div class="row between center">
          <div>${cats}${more}</div>
          <span class="badge">${l.location || '-'}</span>
        </div>
        <h4>${l.title}</h4>
        <p class="muted">${l.description ? l.description.slice(0,120) : ''}</p>
        <div class="row between center">
          <small>${d.toLocaleDateString('tr-TR')}</small>
          <small class="price">${fmt.format(l.totalBudget)} ₺</small>
        </div>
        <div class="row gap">
          <a class="btn small" href="/Listings/Detail?id=${l.id}" onclick="event.stopPropagation()">Detay</a>
          ${bidButtonHtml}
        </div>
      </div>
    `;
  }

  function myListingCard(l){
    const cats = l.items.slice(0, 2).map(i => `<span class="badge">${i.categoryName}</span>`).join(' ');
    const more = l.items.length > 2 ? `<span class="badge">+${l.items.length - 2}</span>` : '';
    return `
      <div class="card listing-card">
        <div class="row between center">
          <div>${cats}${more}</div>
          <span class="badge">${l.status}</span>
        </div>
        <h4>${l.title}</h4>
        <div class="row between center">
          <small>${new Date(l.eventDate).toLocaleDateString('tr-TR')}</small>
          <small class="price">${fmt.format(l.totalBudget)} ₺</small>
        </div>
        <div class="row gap">
          <a class="btn small" href="/Listings/Detail?id=${l.id}">Detay</a>
          <button class="btn small" data-bids="${l.id}">Teklifleri Gör</button>
        </div>
      </div>
    `;
  }

  function bidCard(b){
    const itemsHtml = (b && Array.isArray(b.items) ? b.items : [])
      .map(i => `<div>${i.categoryName}: ${fmt.format(i.amount)} ₺</div>`)
      .join('');

    const bidId = (b && b.id) ? String(b.id) : '';
    const phone = (b && b.vendorPhoneNumber) ? String(b.vendorPhoneNumber).trim() : '';
    const phoneText = phone || 'Telefon yok';

    return `
      <div class="card bid-card">
        <div class="row between center">
          <strong>${b.vendorName || '-'}</strong>
          <span class="badge">${b.status}</span>
        </div>
        <div class="muted" style="margin:8px 0; font-size:14px">${itemsHtml}</div>
        <p class="price">Toplam: ${fmt.format(b.totalAmount)} ₺</p>
        <p class="muted">${b.message || ''}</p>
        <div class="row gap wrap" style="margin-top:10px; align-items:center;">
          <span class="bid-contact-wrap" style="position:relative; display:inline-block; overflow:visible;">
            <button type="button" class="btn small" data-bid-call="${bidId}">İletişime Geç</button>
            <div class="vendor-public-phone-pop" data-bid-phone-pop="${bidId}" style="display:none; position:absolute; left:0; top:calc(100% + 8px); z-index:9999; min-width:260px;">
              <div class="vendor-public-phone-pop-inner">
                <div class="vendor-public-phone-row">
                  <div class="vendor-public-phone-number">${phoneText}</div>
                  <button type="button" class="btn small danger" data-bid-phone-search="${bidId}">Ara</button>
                </div>
              </div>
            </div>
          </span>
        </div>
      </div>
    `;
  }

  function bindBidCallPopups(container){
    if (!container) return;

    // Bind call buttons
    container.querySelectorAll('[data-bid-call]').forEach(btn => {
      if (btn.__bidCallBound) return;
      btn.__bidCallBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-bid-call');
        if (!id) return;
        const pop = container.querySelector(`[data-bid-phone-pop="${CSS.escape(id)}"]`);
        if (!pop) return;

        // Close other popups in this container
        container.querySelectorAll('[data-bid-phone-pop]').forEach(p => {
          if (p !== pop) p.style.display = 'none';
        });

        pop.style.display = (pop.style.display === 'none' || !pop.style.display) ? 'block' : 'none';
      });
    });

    // Dummy search button (no-op)
    container.querySelectorAll('[data-bid-phone-search]').forEach(btn => {
      if (btn.__bidPhoneSearchBound) return;
      btn.__bidPhoneSearchBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // intentionally no action
      });
    });

    // Close on outside click (bind once globally)
    if (!window.__bidPhoneOutsideClickBound) {
      window.__bidPhoneOutsideClickBound = true;
      document.addEventListener('click', (e) => {
        const t = e.target;
        if (!t) return;
        // If click is inside any popup or on any call button, ignore
        if (t.closest && (t.closest('[data-bid-phone-pop]') || t.closest('[data-bid-call]'))) return;
        document.querySelectorAll('[data-bid-phone-pop]').forEach(p => {
          p.style.display = 'none';
        });
      });
    }
  }

  async function loadCategories(selectEl){
    const cats = await api('/api/categories');
    selectEl.innerHTML = '<option value="">Kategori (hepsi)</option>' + cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  async function loadCategoriesAsNames(selectEl, placeholderText){
    const cats = await api('/api/categories');
    const placeholder = placeholderText || 'Kategori (hepsi)';
    selectEl.innerHTML = `<option value="">${placeholder}</option>` + cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  }

  function loadEventPurposes(selectEl, placeholderText) {
    if (!selectEl) return;
    const placeholder = placeholderText || 'Ne için? (hepsi)';
    selectEl.innerHTML = `<option value="">${placeholder}</option>` +
      EVENT_PURPOSE_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('');
  }

  async function loadUserCategories(){
    const cats = await api('/api/categories');
    // We will use this list to populate dynamic rows, not a single select
    window.__categories = cats; // Store globally for dynamic rows
  }

  // Ana sayfa için basit ilan yükleme (filtre yok)
  async function loadHomepageListings() {
    const list = await api('/api/listings');
    
    const grid = $('#listingCarousel');
    if (!grid) return;
    
    if (!list.length) {
      grid.innerHTML = '<div class="muted">Henüz ilan bulunmuyor.</div>';
      return;
    }
    
    // Carousel için tüm ilanları sakla
    window.__allListings = list;
    window.__currentCarouselIndex = 0;
    
    // İlk 3 ilanı göster
    showCarouselSlide(0);
    
    // 3 saniyede bir değiştir
    if (window.__carouselInterval) clearInterval(window.__carouselInterval);
    window.__carouselInterval = setInterval(() => {
      const nextIndex = (window.__currentCarouselIndex + 3) % window.__allListings.length;
      showCarouselSlide(nextIndex);
      window.__currentCarouselIndex = nextIndex;
    }, 3000);
  }

  async function initHomeVenueStream() {
    const track = $('#homeVenueTrack');
    if (!track) return;

    // Mekanları Keşfet: sabit mekan listeleri + tools/fetch_place_images.py ile indirilen görseller
    // wwwroot/img/place-photos/manifest.json
    const places = ([]
      .concat(Array.isArray(GOLBASI_PLACES) ? GOLBASI_PLACES : [])
      .concat(Array.isArray(PHOTOGRAPHERS) ? PHOTOGRAPHERS : [])
      .concat(Array.isArray(BAKERIES) ? BAKERIES : [])
      .concat(Array.isArray(FLORISTS) ? FLORISTS : []))
      .filter(p => p && p.name);

    if (!places.length) {
      track.innerHTML = '<div class="muted" style="padding:12px;">Şu an kayıtlı mekan bulunamadı.</div>';
      return;
    }

    const makeImg = (place) => {
      const img = createCategoryImageElement(place.category, '', 640, 360, 'home-venue-img', place.name);
      img.setAttribute('aria-busy', 'true');
      img.addEventListener('load', () => img.setAttribute('aria-busy', 'false'));
      img.onerror = () => {
        img.onerror = null;
        img.src = localCategoryAssetUrl(place.category || 'venue', 'svg');
      };
      return img;
    };

    track.innerHTML = '';
    const imgs = places.map(makeImg);
    imgs.forEach(img => track.appendChild(img));
    // Duplicate once for seamless loop (CSS translates -50%)
    places.map(makeImg).forEach(img => track.appendChild(img));

    // Eğer dış kaynak görseller tamamen engelliyse, kısa süre sonra uyarı göster.
    window.setTimeout(() => {
      const remaining = track.querySelectorAll('img.home-venue-img').length;
      if (remaining === 0) {
        track.innerHTML = '<div class="muted" style="padding:12px;">Şu an mekan görselleri yüklenemedi.</div>';
      }
    }, 1500);

    const durationSeconds = Math.max(40, Math.min(180, places.length * 4));
    track.style.setProperty('--homeMarqueeDuration', `${durationSeconds}s`);
  }

  async function initHomeListingsStream() {
    const track = $('#homeListingTrack');
    if (!track) return;

    let list = [];
    try {
      const res = await api('/api/listings');
      list = Array.isArray(res) ? res : [];
    } catch (err) {
      console.warn('Home listings stream: API erişilemedi.', err);
      track.innerHTML = '<div class="muted" style="padding:12px;">Aktif ilanlar yüklenemedi.</div>';
      return;
    }

    // Try to keep only active listings if the API provides a flag.
    const active = list.filter(l => {
      const visibility = (l && typeof l.visibility !== 'undefined') ? String(l.visibility) : null;
      const status = (l && typeof l.status !== 'undefined' && l.status !== null) ? String(l.status) : '';
      if (visibility !== null) return visibility === '1';
      if (status) return status.toLowerCase() === 'aktif' || status.toLowerCase() === 'active';
      return true;
    });

    const sorted = active.slice().sort((a, b) => {
      const da = a && a.eventDate ? Date.parse(a.eventDate) : 0;
      const db = b && b.eventDate ? Date.parse(b.eventDate) : 0;
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da - db;
    });

    // Don't list all: keep it limited for a clean stream.
    const top = sorted.slice(0, 10);
    if (!top.length) {
      track.innerHTML = '<div class="muted" style="padding:12px;">Şu an aktif ilan bulunmuyor.</div>';
      return;
    }

    // Build a scrolling row. Use existing card HTML (consistent look).
    track.innerHTML = top.map(l => listingCard(l, true)).join('');
    // Duplicate once for seamless loop (CSS translates -50%)
    track.innerHTML += top.map(l => listingCard(l, true)).join('');

    // Slightly stagger entry animation (optional)
    const cards = track.querySelectorAll('.listing-card');
    cards.forEach((card, i) => {
      card.style.opacity = '1';
      card.style.animationDelay = `${(i % top.length) * 0.06}s`;
      card.classList.add('animate');
    });

    const durationSeconds = Math.max(45, Math.min(120, top.length * 9));
    track.style.setProperty('--homeListingMarqueeDuration', `${durationSeconds}s`);
  }

  // Live Stats Counter Animation
  function initLiveStatsCounter() {
    const statNumbers = document.querySelectorAll('.stat-number');
    if (!statNumbers.length) return;

    const animateCounter = (element) => {
      const target = parseInt(element.dataset.target, 10);
      const suffix = element.dataset.suffix || '';
      const duration = 2000; // 2 saniye
      const increment = target / (duration / 16); // ~60fps
      let current = 0;

      const updateCounter = () => {
        current += increment;
        if (current < target) {
          element.textContent = Math.floor(current).toLocaleString('tr-TR') + suffix;
          requestAnimationFrame(updateCounter);
        } else {
          element.textContent = target.toLocaleString('tr-TR') + suffix;
        }
      };

      updateCounter();
    };

    // Intersection Observer ile görünür olunca animasyonu başlat
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });

    statNumbers.forEach(stat => observer.observe(stat));
  }

  async function search(){
    const params = new URLSearchParams();
    const q = $('#q').value.trim();
    const location = $('#location').value.trim();
    const cat = $('#category').value;
    const minBudget = $('#minBudget').value;
    const maxBudget = $('#maxBudget').value;
    if (q) params.set('q', q);
    if (location) params.set('location', location);
    if (cat) params.set('categoryId', cat);
    if (minBudget) params.set('minBudget', minBudget);
    if (maxBudget) params.set('maxBudget', maxBudget);
    const list = await api('/api/listings' + (params.toString() ? ('?' + params.toString()) : ''));
    
    const grid = $('#listingCarousel');
    if (!grid) return; // Not on homepage
    
    if (!list.length) {
      grid.innerHTML = '<div class="muted">Kriterlere uygun ilan bulunamadı.</div>';
      return;
    }
    
    // Carousel için tüm ilanları sakla
    window.__allListings = list;
    window.__currentCarouselIndex = 0;
    
    // İlk 3 ilanı göster
    showCarouselSlide(0);
    
    // 3 saniyede bir değiştir
    if (window.__carouselInterval) clearInterval(window.__carouselInterval);
    window.__carouselInterval = setInterval(() => {
      const nextIndex = (window.__currentCarouselIndex + 3) % window.__allListings.length;
      showCarouselSlide(nextIndex);
      window.__currentCarouselIndex = nextIndex;
    }, 3000);
  }
  
  function showCarouselSlide(startIndex) {
    const grid = $('#listingCarousel');
    if (!grid || !window.__allListings) return;
    
    const listings = window.__allListings;
    const endIndex = startIndex + 3;
    let displayListings = [];
    
    // Circular array handling
    for (let i = startIndex; i < endIndex; i++) {
      displayListings.push(listings[i % listings.length]);
    }
    
    // Fade out
    grid.style.opacity = '0';
    
    setTimeout(() => {
      grid.innerHTML = displayListings.map(l => listingCard(l, true)).join('');
      
      // Fade in
      setTimeout(() => {
        grid.style.opacity = '1';
        const cards = grid.querySelectorAll('.listing-card');
        cards.forEach((card, i) => {
          setTimeout(() => {
            card.style.animationDelay = `${i * 0.15}s`;
            card.classList.add('animate');
          }, 50);
        });
      }, 50);
    }, 300);
  }
  
  const TR_LOCATIONS = [
    'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray',
    'Amasya', 'Ankara', 'Antalya', 'Ardahan', 'Artvin',
    'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt',
    'Bilecik', 'Bingöl', 'Bitlis', 'Bolu', 'Burdur',
    'Bursa', 'Çanakkale', 'Çankırı', 'Çorum', 'Denizli',
    'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan',
    'Erzurum', 'Eskişehir', 'Gaziantep', 'Giresun', 'Gümüşhane',
    'Hakkâri', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
    'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars',
    'Kastamonu', 'Kayseri', 'Kilis', 'Kırıkkale', 'Kırklareli',
    'Kırşehir', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya',
    'Manisa', 'Mardin', 'Mersin', 'Muğla', 'Muş',
    'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye', 'Rize',
    'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas',
    'Şanlıurfa', 'Şırnak', 'Tekirdağ', 'Tokat', 'Trabzon',
    'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat',
    'Zonguldak'
  ];

  const EVENT_PURPOSE_OPTIONS = [
    'Yıl dönümü',
    'Düğün',
    'Nişan',
    'Kına',
    'Nikah',
    'Doğum günü',
    'Mezuniyet',
    'Baby shower',
    'Sünnet',
    'Evlilik teklifi',
    'Bekarlığa veda',
    'Kurumsal etkinlik',
    'Toplantı',
    'Kokteyl',
    'Gala',
    'Lansman',
    'Konser',
    'Festival',
    'İftar',
    'Yılbaşı',
    'Sevgililer günü',
    'Diğer'
  ];

  // Türkiye şehir koordinatları
  const TR_CITY_COORDS = {
    'Adana': [37.0000, 35.3213],
    'Adıyaman': [37.7648, 38.2786],
    'Afyonkarahisar': [38.7507, 30.5567],
    'Ağrı': [39.7191, 43.0503],
    'Aksaray': [38.3687, 34.0370],
    'Amasya': [40.6499, 35.8353],
    'Ankara': [39.9334, 32.8597],
    'Antalya': [36.8969, 30.7133],
    'Ardahan': [41.1105, 42.7022],
    'Artvin': [41.1828, 41.8183],
    'Aydın': [37.8560, 27.8416],
    'Balıkesir': [39.6484, 27.8826],
    'Bartın': [41.6344, 32.3375],
    'Batman': [37.8812, 41.1351],
    'Bayburt': [40.2552, 40.2249],
    'Bilecik': [40.0567, 30.0665],
    'Bingöl': [38.8854, 40.4966],
    'Bitlis': [38.4004, 42.1095],
    'Bolu': [40.7392, 31.6089],
    'Burdur': [37.7203, 30.2906],
    'Bursa': [40.1826, 29.0665],
    'Çanakkale': [40.1553, 26.4142],
    'Çankırı': [40.6013, 33.6134],
    'Çorum': [40.5506, 34.9556],
    'Denizli': [37.7765, 29.0864],
    'Diyarbakır': [37.9144, 40.2306],
    'Düzce': [40.8438, 31.1565],
    'Edirne': [41.6818, 26.5623],
    'Elazığ': [38.6810, 39.2264],
    'Erzincan': [39.7500, 39.5000],
    'Erzurum': [39.9000, 41.2700],
    'Eskişehir': [39.7767, 30.5206],
    'Gaziantep': [37.0662, 37.3833],
    'Giresun': [40.9128, 38.3895],
    'Gümüşhane': [40.4386, 39.5086],
    'Hakkâri': [37.5833, 43.7333],
    'Hatay': [36.4018, 36.3498],
    'Iğdır': [39.9237, 44.0450],
    'Isparta': [37.7648, 30.5566],
    'İstanbul': [41.0082, 28.9784],
    'İzmir': [38.4192, 27.1287],
    'Kahramanmaraş': [37.5858, 36.9371],
    'Karabük': [41.2061, 32.6204],
    'Karaman': [37.1759, 33.2287],
    'Kars': [40.6167, 43.1000],
    'Kastamonu': [41.3887, 33.7827],
    'Kayseri': [38.7312, 35.4787],
    'Kilis': [36.7184, 37.1212],
    'Kırıkkale': [39.8468, 33.5153],
    'Kırklareli': [41.7333, 27.2167],
    'Kırşehir': [39.1425, 34.1709],
    'Kocaeli': [40.8533, 29.8815],
    'Konya': [37.8667, 32.4833],
    'Kütahya': [39.4167, 29.9833],
    'Malatya': [38.3552, 38.3095],
    'Manisa': [38.6191, 27.4289],
    'Mardin': [37.3212, 40.7245],
    'Mersin': [36.8121, 34.6415],
    'Muğla': [37.2153, 28.3636],
    'Muş': [38.9462, 41.7539],
    'Nevşehir': [38.6244, 34.7239],
    'Niğde': [37.9667, 34.6833],
    'Ordu': [40.9839, 37.8764],
    'Osmaniye': [37.0742, 36.2478],
    'Rize': [41.0201, 40.5234],
    'Sakarya': [40.6940, 30.4358],
    'Samsun': [41.2928, 36.3313],
    'Siirt': [37.9333, 41.9500],
    'Sinop': [42.0231, 35.1531],
    'Sivas': [39.7477, 37.0179],
    'Şanlıurfa': [37.1591, 38.7969],
    'Şırnak': [37.4187, 42.4918],
    'Tekirdağ': [40.9833, 27.5167],
    'Tokat': [40.3167, 36.5500],
    'Trabzon': [41.0015, 39.7178],
    'Tunceli': [39.1079, 39.5401],
    'Uşak': [38.6823, 29.4082],
    'Van': [38.4891, 43.4089],
    'Yalova': [40.6500, 29.2667],
    'Yozgat': [39.8181, 34.8147],
    'Zonguldak': [41.4564, 31.7987]
  };

  window.__activePlaceCard = null;

  function flyToMarker(map, marker) {
    if (!map || !marker || typeof marker.getLatLng !== 'function') return;
    const target = marker.getLatLng();
    if (!target) return;
    const currentZoom = map.getZoom ? map.getZoom() : 11;
    const targetZoom = currentZoom < 13 ? 13 : currentZoom;
    map.flyTo(target, targetZoom, { duration: 0.5 });
    if (typeof marker.openPopup === 'function') {
      setTimeout(() => marker.openPopup(), 350);
    }
  }

  function attachPlaceCardInteraction(card, map, marker) {
    if (!card) return;
    card.classList.add('pazar-place-card');
    card.tabIndex = 0;

    const activate = () => {
      if (window.__activePlaceCard && window.__activePlaceCard !== card) {
        window.__activePlaceCard.classList.remove('pazar-place-card--active');
      }
      card.classList.add('pazar-place-card--active');
      window.__activePlaceCard = card;
      flyToMarker(map, marker);
    };

    card.addEventListener('click', activate);
    card.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        activate();
      }
    });
  }

  function setPazarSearchType(type) {
    const normalized = type === 'hizmet' ? 'hizmet' : 'ilan';
    window.__pazarSearchType = normalized;

    const btnListings = document.getElementById('pazarTypeListings');
    const btnServices = document.getElementById('pazarTypeServices');
    const listingFilters = document.getElementById('pazarFiltersListings');
    const serviceFilters = document.getElementById('pazarFiltersServices');

    if (btnListings && btnServices) {
      btnListings.classList.toggle('primary', normalized === 'ilan');
      btnServices.classList.toggle('primary', normalized === 'hizmet');
    }

    if (listingFilters && serviceFilters) {
      listingFilters.style.display = normalized === 'ilan' ? 'flex' : 'none';
      serviceFilters.style.display = normalized === 'hizmet' ? 'flex' : 'none';
    }

    return normalized;
  }

  function bindPazarTypeToggle() {
    const btnListings = document.getElementById('pazarTypeListings');
    const btnServices = document.getElementById('pazarTypeServices');
    if (!btnListings || !btnServices) return;

    setPazarSearchType(window.__pazarSearchType || 'ilan');

    btnListings.addEventListener('click', async () => {
      setPazarSearchType('ilan');
      await searchPazarDispatch({ skipFetchIfPossible: true });
    });

    btnServices.addEventListener('click', async () => {
      setPazarSearchType('hizmet');
      await searchPazarDispatch({ skipFetchIfPossible: true });
    });
  }

  const TURKIYE_PROVINCES_ENDPOINT = 'https://turkiyeapi.dev/api/v1/provinces';
  const PROVINCE_CACHE_KEY = 'evently_tr_provinces_v1';
  const PROVINCE_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 saat önbellek
  let provinceFetchPromise = null;

  function readProvinceCache(){
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    try {
      const raw = window.sessionStorage.getItem(PROVINCE_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.data) || !parsed.timestamp) return null;
      if (Date.now() - parsed.timestamp > PROVINCE_CACHE_TTL_MS) {
        window.sessionStorage.removeItem(PROVINCE_CACHE_KEY);
        return null;
      }
      return parsed.data;
    } catch (err) {
      console.warn('Konum önbelleği okunamadı:', err.message);
      return null;
    }
  }

  function writeProvinceCache(data){
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    try {
      const payload = JSON.stringify({ timestamp: Date.now(), data });
      window.sessionStorage.setItem(PROVINCE_CACHE_KEY, payload);
    } catch (err) {
      console.warn('Konum önbelleği yazılamadı:', err.message);
    }
  }

  async function fetchProvinceDataset(){
    const res = await fetch(TURKIYE_PROVINCES_ENDPOINT);
    if (!res.ok) throw new Error('Konum verileri yüklenemedi.');
    const json = await res.json();
    if (!json || !Array.isArray(json.data)) throw new Error('Beklenmeyen konum verisi alındı.');
    const provinces = json.data.map(province => ({
      id: province.id,
      name: province.name,
      districts: Array.isArray(province.districts)
        ? province.districts
            .map(d => d && d.name)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'tr'))
        : []
    })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    writeProvinceCache(provinces);
    return provinces;
  }

  async function getProvinceDataset(){
    if (window.__provinceDataset && Array.isArray(window.__provinceDataset)) {
      return window.__provinceDataset;
    }
    const cached = readProvinceCache();
    if (cached) {
      window.__provinceDataset = cached;
      return cached;
    }
    if (!provinceFetchPromise) {
      provinceFetchPromise = fetchProvinceDataset().finally(() => {
        provinceFetchPromise = null;
      });
    }
    const data = await provinceFetchPromise;
    window.__provinceDataset = data;
    return data;
  }

  function parseLocationParts(value){
    if (!value) return { province: '', district: '' };
    const separators = ['/', '-', ','];
    for (const sep of separators) {
      if (value.includes(sep)) {
        const segments = value.split(sep).map(part => part.trim()).filter(Boolean);
        return {
          province: segments[0] || '',
          district: segments[1] || ''
        };
      }
    }
    return { province: value.trim(), district: '' };
  }

  async function initUserLocationSelectors(){
    const provinceSelect = $('#provinceSelect');
    const districtSelect = $('#districtSelect');
    const hiddenInput = $('#locationInput') || document.querySelector('input[name="location"]');
    const preview = $('#locationPreview');
    const defaultPreviewText = 'Henüz seçim yapılmadı';
    if (!provinceSelect || !districtSelect || !hiddenInput) return null;

    const setDistrictPlaceholder = (text, disable = true) => {
      districtSelect.innerHTML = `<option value="">${text}</option>`;
      districtSelect.disabled = disable;
      districtSelect.required = !disable;
      if (!disable) {
        districtSelect.value = '';
      }
    };

    provinceSelect.innerHTML = '<option value="">İl seçin</option>';
    provinceSelect.disabled = true;
    setDistrictPlaceholder('Önce il seçin', true);
    if (preview) preview.textContent = 'Konum verisi yükleniyor...';

    let provinces = [];
    try {
      provinces = await getProvinceDataset();
    } catch (err) {
      console.error('İl/ilçe listesi alınamadı:', err);
      provinceSelect.innerHTML = '<option value="">Konum verisi yüklenemedi</option>';
      setDistrictPlaceholder('Konum verisi yok', true);
      if (preview) preview.textContent = 'Konum verisi yüklenemedi, lütfen konumu elle yazın.';
      hiddenInput.type = 'text';
      hiddenInput.classList.add('input');
      hiddenInput.style.display = 'block';
      hiddenInput.placeholder = 'Konumu elle girin';
      return null;
    }

    provinces.forEach(province => {
      const option = document.createElement('option');
      option.value = province.name;
      option.textContent = province.name;
      provinceSelect.appendChild(option);
    });
    provinceSelect.disabled = false;

    const updateHiddenValue = () => {
      const provinceName = provinceSelect.value;
      const districtName = districtSelect.disabled ? '' : districtSelect.value;
      let combined = '';
      let summary = defaultPreviewText;
      if (provinceName && districtName) {
        combined = `${provinceName} / ${districtName}`;
        summary = combined;
      } else if (provinceName) {
        combined = provinceName;
        summary = provinceName;
      }
      hiddenInput.value = combined;
      if (preview) preview.textContent = summary;
    };

    const populateDistricts = (provinceName) => {
      const province = provinces.find(p => p.name === provinceName);
      if (!province || !province.districts.length) {
        setDistrictPlaceholder(provinceName ? 'İlçe bilgisi bulunamadı' : 'Önce il seçin', true);
        updateHiddenValue();
        return;
      }
      districtSelect.disabled = false;
      districtSelect.required = true;
      districtSelect.innerHTML = '<option value="">İlçe seçin</option>' +
        province.districts.map(d => `<option value="${d}">${d}</option>`).join('');
      districtSelect.value = '';
    };

    provinceSelect.addEventListener('change', () => {
      populateDistricts(provinceSelect.value);
      updateHiddenValue();
    });

    districtSelect.addEventListener('change', updateHiddenValue);

    const initialParts = parseLocationParts(hiddenInput.value);
    if (initialParts.province) {
      provinceSelect.value = initialParts.province;
      populateDistricts(initialParts.province);
      if (initialParts.district) {
        districtSelect.value = initialParts.district;
      }
    }

    updateHiddenValue();

    return {
      reset() {
        provinceSelect.value = '';
        provinceSelect.dispatchEvent(new Event('change'));
        if (preview) preview.textContent = defaultPreviewText;
      }
    };
  }

  function getSelectText(selectEl){
    if (!selectEl) return '';
    const opt = selectEl.options && selectEl.selectedIndex >= 0 ? selectEl.options[selectEl.selectedIndex] : null;
    const text = opt ? (opt.textContent || '') : '';
    return (text || '').trim();
  }

  function getPazarListingFilters(){
    return {
      q: (($('#pazarListingQ') && $('#pazarListingQ').value) || '').trim(),
      location: (($('#pazarListingLocation') && $('#pazarListingLocation').value) || '').trim(),
      categoryId: (($('#pazarListingCategory') && $('#pazarListingCategory').value) || '').trim(),
      categoryName: getSelectText($('#pazarListingCategory')),
      minBudget: (($('#pazarListingMinBudget') && $('#pazarListingMinBudget').value) || '').trim(),
      maxBudget: (($('#pazarListingMaxBudget') && $('#pazarListingMaxBudget').value) || '').trim(),
    };
  }

  function getPazarServiceFilters(){
    return {
      purpose: (($('#pazarServicePurpose') && $('#pazarServicePurpose').value) || '').trim(),
      service: (($('#pazarServiceTerm') && $('#pazarServiceTerm').value) || '').trim(),
      category: (($('#pazarServiceCategory') && $('#pazarServiceCategory').value) || '').trim(),
      location: (($('#pazarServiceLocation') && $('#pazarServiceLocation').value) || '').trim(),
      minBudget: (($('#pazarServiceMinBudget') && $('#pazarServiceMinBudget').value) || '').trim(),
      maxBudget: (($('#pazarServiceMaxBudget') && $('#pazarServiceMaxBudget').value) || '').trim(),
    };
  }

  async function searchPazarListings(filtersOverride = null){
    const params = new URLSearchParams();
    const f = filtersOverride || getPazarListingFilters();
    const q = f.q;
    const location = f.location;
    const cat = f.categoryId;
    const minBudget = f.minBudget;
    const maxBudget = f.maxBudget;
    if (q) params.set('q', q);
    if (location) params.set('location', location);
    if (cat) params.set('categoryId', cat);
    if (minBudget) params.set('minBudget', minBudget);
    if (maxBudget) params.set('maxBudget', maxBudget);
    const list = await api('/api/listings' + (params.toString() ? ('?' + params.toString()) : ''));
    
    const grid = $('#pazarListingGrid');
    if (!Array.isArray(list) || !list.length) {
      if (grid) grid.innerHTML = '<div class="muted">Kriterlere uygun ilan bulunamadı.</div>';
      window.__pazarListings = [];
      return [];
    }
    
    grid.innerHTML = list.map(l => listingCard(l, false, { usePazarModal: true })).join('');
    const cards = grid.querySelectorAll('.listing-card');
    cards.forEach((card, i) => {
      setTimeout(() => {
        card.style.animationDelay = `${i * 0.1}s`;
        card.classList.add('animate');
      }, 0);
    });

    // Harita ve mekan listesi için verileri sakla
    window.__pazarListings = list;
    return list;
  }

  async function searchPazarVendors(vendorParams){
    const params = new URLSearchParams();

    const vp = vendorParams || {};
    if (vp.q) params.set('q', vp.q);
    if (vp.location) params.set('location', vp.location);
    if (vp.purpose) params.set('purpose', vp.purpose);
    if (vp.service) params.set('service', vp.service);
    if (vp.category) params.set('category', vp.category);
    if (vp.minBudget) params.set('minBudget', vp.minBudget);
    if (vp.maxBudget) params.set('maxBudget', vp.maxBudget);

    let vendors = [];
    try {
      vendors = await api('/api/vendors/map' + (params.toString() ? ('?' + params.toString()) : ''));
    } catch (err) {
      console.error('Vendor search error:', err);
      vendors = [];
    }

    window.__pazarVendors = Array.isArray(vendors) ? vendors : [];
    return window.__pazarVendors;
  }

  async function showAllPazar(){
    const results = await Promise.all([
      searchPazarListings({ q: '', location: '', categoryId: '', categoryName: '', minBudget: '', maxBudget: '' }).catch(() => []),
      searchPazarVendors({}).catch(() => [])
    ]);
    const listings = Array.isArray(results[0]) ? results[0] : [];
    const vendors = Array.isArray(results[1]) ? results[1] : [];
    await updatePazarMapAndPlaces(listings, '', { vendorPlaces: vendors });
  }

  async function searchPazarDispatch(options = {}){
    const type = window.__pazarSearchType || 'ilan';
    const { skipFetchIfPossible = false } = options || {};

    if (type === 'ilan') {
      const listingFilters = getPazarListingFilters();
      const selectedCity = (listingFilters.location || '').trim();

      if (skipFetchIfPossible && Array.isArray(window.__pazarListings) && window.__pazarListings.length) {
        await updatePazarMapAndPlaces(window.__pazarListings, selectedCity, {
          vendorPlaces: [],
          skipPlacesPanel: true
        });
        return;
      }

      const listings = await searchPazarListings(listingFilters).catch(() => []);
      await updatePazarMapAndPlaces(listings, selectedCity, {
        vendorPlaces: [],
        skipPlacesPanel: true
      });
      return;
    }

    // hizmet
    const serviceFilters = getPazarServiceFilters();
    const selectedCity = (serviceFilters.location || '').trim();
    const vendorQuery = {
      location: serviceFilters.location,
      purpose: serviceFilters.purpose,
      service: serviceFilters.service,
      category: serviceFilters.category,
      minBudget: serviceFilters.minBudget,
      maxBudget: serviceFilters.maxBudget,
    };

    if (skipFetchIfPossible && Array.isArray(window.__pazarVendors) && window.__pazarVendors.length) {
      await updatePazarMapAndPlaces([], selectedCity, { vendorPlaces: window.__pazarVendors });
      return;
    }

    const vendors = await searchPazarVendors(vendorQuery).catch(() => []);
    await updatePazarMapAndPlaces([], selectedCity, { vendorPlaces: vendors });
  }

  async function searchMarketplace(){
    const grid = $('#marketplaceGrid');
    if (!grid) return;

    const params = new URLSearchParams();
    const qEl = $('#q');
    const locationEl = $('#location');
    const categoryEl = $('#category');
    const minBudgetEl = $('#minBudget');
    const maxBudgetEl = $('#maxBudget');

    const q = qEl ? qEl.value.trim() : '';
    const location = locationEl ? locationEl.value.trim() : '';
    const cat = categoryEl ? categoryEl.value : '';
    const minBudget = minBudgetEl ? minBudgetEl.value : '';
    const maxBudget = maxBudgetEl ? maxBudgetEl.value : '';

    if (q) params.set('q', q);
    if (location) params.set('location', location);
    if (cat) params.set('categoryId', cat);
    if (minBudget) params.set('minBudget', minBudget);
    if (maxBudget) params.set('maxBudget', maxBudget);

    const list = await api('/api/listings' + (params.toString() ? ('?' + params.toString()) : ''));
    if (!Array.isArray(list) || !list.length) {
      grid.innerHTML = '<div class="muted">Kriterlere uygun ilan bulunamadı.</div>';
      return;
    }

    grid.innerHTML = list.map(l => listingCard(l, false)).join('');
    const cards = grid.querySelectorAll('.listing-card');
    cards.forEach((card, i) => {
      setTimeout(() => {
        card.style.animationDelay = `${i * 0.08}s`;
        card.classList.add('animate');
      }, 0);
    });
  }

  let pazarBidGridBound = false;
  let pazarBidDialogBound = false;

  function ensurePazarBidButtonBinding() {
    if (pazarBidGridBound) return;

    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-open-pazar-bid]') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-open-pazar-bid');
      if (!id) return;
      openPazarBidModal(id);
    });

    pazarBidGridBound = true;
  }

  function initPazarBidDialogBase() {
    if (pazarBidDialogBound) return;
    const dialog = $('#pazarBidDialog');
    if (dialog && typeof dialog.addEventListener === 'function') {
      // Backdrop click closes
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog && typeof dialog.close === 'function') {
          dialog.close();
        }
      });
    }
    pazarBidDialogBound = true;
  }

  function buildPazarBidItemsHtml(listing) {
    const items = listing && Array.isArray(listing.items) ? listing.items : [];
    if (!items.length) {
      return '<div class="muted">Bu ilanın teklif kalemleri bulunamadı.</div>';
    }

    return items.map(i => {
      const budget = (typeof i.budget === 'number') ? i.budget : parseFloat(i.budget);
      const budgetText = Number.isFinite(budget) ? `${fmt.format(budget)} ₺` : '';
      return `
        <div class="bid-item-row">
          <label class="bid-item-label">
            <input type="checkbox" class="bid-item-checkbox" value="${i.id}" />
            <span>${i.categoryName}</span>
          </label>
          <span class="muted">${budgetText}</span>
          <input type="number" class="input small bid-amount" data-for="${i.id}" placeholder="Teklif (₺)" disabled />
        </div>
      `;
    }).join('');
  }

  function buildPazarBidMarkup(listing) {
    const description = listing.description ? `<p class="muted">${listing.description}</p>` : '';
    return `
      <div class="bid-dialog__listing-info">
        <div>
          <div class="muted">${listing.location || 'Konum belirtilmedi'}</div>
          <div class="muted">${new Date(listing.eventDate).toLocaleDateString('tr-TR')}</div>
        </div>
        <div class="bid-dialog__budget">${fmt.format(listing.totalBudget)} ₺</div>
      </div>
      ${description}
      <form id="pazarBidForm" data-listing-id="${listing.id}">
        <div class="bid-dialog__items">
          ${buildPazarBidItemsHtml(listing)}
        </div>
        <textarea name="message" class="input" rows="3" placeholder="Mesaj (opsiyonel)"></textarea>
        <div class="bid-dialog__actions">
          <button type="button" class="btn" data-cancel-bid>Vazgeç</button>
          <button type="submit" class="btn primary">Teklif Gönder</button>
        </div>
      </form>
    `;
  }

  function openPazarBidModal(listingId) {
    const dialog = $('#pazarBidDialog');
    const content = $('#pazarBidContent');
    const title = $('#pazarBidTitle');
    if (!dialog || !content || !title) return;

    if (!token() || role() !== 'Vendor') {
      window.location.href = '/Auth/Login';
      return;
    }

    const listing = (window.__pazarListings || []).find(l => String(l.id) === String(listingId));
    if (!listing) {
      alert('İlan bilgisi bulunamadı. Lütfen sayfayı yenileyin.');
      return;
    }

    title.textContent = listing.title;
    content.innerHTML = buildPazarBidMarkup(listing);

    const form = content.querySelector('#pazarBidForm');
    if (form) {
      form.addEventListener('submit', async (evt) => {
        evt.preventDefault();
        const selectedItems = [];
        form.querySelectorAll('.bid-item-checkbox:checked').forEach(cb => {
          const amountEl = form.querySelector(`.bid-amount[data-for="${cb.value}"]`);
          if (amountEl && amountEl.value) {
            selectedItems.push({
              eventListingItemId: cb.value,
              amount: parseFloat(amountEl.value)
            });
          }
        });

        if (!selectedItems.length) {
          alert('Lütfen en az bir kalem için teklif tutarı giriniz.');
          return;
        }

        const payload = {
          eventListingId: listing.id,
          items: selectedItems,
          message: form.message.value
        };

        try {
          await api('/api/bids', { method: 'POST', body: JSON.stringify(payload) });
          alert('Teklif gönderildi.');
          dialog.close();
          if (typeof loadMyBids === 'function') {
            try {
              await loadMyBids();
            } catch (err) {
              console.warn('Teklif listesi güncellenemedi:', err);
            }
          }
        } catch (err) {
          console.error('Pazar teklif hatası:', err);
          alert('Hata: ' + (err.message || 'Teklif gönderilemedi.'));
        }
      });

      form.querySelectorAll('.bid-item-checkbox').forEach(cb => {
        const amountInput = form.querySelector(`.bid-amount[data-for="${cb.value}"]`);
        cb.addEventListener('change', () => {
          if (!amountInput) return;
          if (cb.checked) {
            amountInput.disabled = false;
            amountInput.focus();
          } else {
            amountInput.disabled = true;
            amountInput.value = '';
          }
        });
      });

      const cancelBtn = form.querySelector('[data-cancel-bid]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => dialog.close());
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', 'true');
    }
  }

  async function openListingBidsDialog(listingId) {
    if (!(await ensureAuth('User'))) return;
    const dialog = $('#bidsDialog');
    const container = $('#bidsContainer');
    if (!dialog || !container) {
      console.warn('Bids dialog bulunamadı.');
      return;
    }
    container.innerHTML = '<div class="muted">Teklifler yükleniyor...</div>';
    try {
      const bids = await api(`/api/listings/${listingId}/bids`);
      container.innerHTML = bids.length ? bids.map(bidCard).join('') : '<div class="muted">Henüz teklif yok.</div>';
      bindBidCallPopups(container);
    } catch (err) {
      console.error('Teklifler yüklenemedi:', err);
      container.innerHTML = `<div class="muted">Hata: ${err.message}</div>`;
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', 'true');
    }
  }

  async function ensureAuth(roleNeeded){
    if (!token()) { window.location.href = '/Auth/Login'; return false; }
    if (roleNeeded && role() !== roleNeeded) { window.location.href = '/Auth/Login'; return false; }
    return true;
  }

  // Leaflet helpers
  function initLeafletMap(containerId, initial=[41.015137, 28.979530], zoom=11) {
    const map = L.map(containerId).setView(initial, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap katılımcıları'
    }).addTo(map);
    return map;
  }

  // Listing detail page loader
  window.loadListingDetail = async function(){
    try{
      const id = window.__listingId;
      const l = await api(`/api/listings/${id}`);
      const el = $('#listingDetail');
      window.__currentDetailListing = l;
      window.__pazarListings = [l];
      const isVendorViewing = !!token() && role() === 'Vendor';
      const storedUserId = userId();
      const currentUserGuid = storedUserId ? storedUserId.toLowerCase() : '';
      const listingOwnerGuid = (typeof l.createdByUserId === 'string'
        ? l.createdByUserId
        : (l.createdByUserId ? String(l.createdByUserId) : '')).toLowerCase();
      const isOwner = role() === 'User' && currentUserGuid && listingOwnerGuid && currentUserGuid === listingOwnerGuid;
      let bidCta = '';
      if (isOwner) {
        bidCta = `<button type="button" class="btn primary" data-detail-bids="${l.id}">Teklifler</button>`;
      } else if (isVendorViewing) {
        bidCta = `<button type="button" class="btn primary" data-detail-bid="${l.id}">Teklif Ver</button>`;
      } else {
        bidCta = `<a class="btn primary" href="/Auth/Login">Teklif Ver</a>`;
      }
      
      const itemsHtml = l.items.map(i => `
        <div class="row between center" style="padding:8px 0; border-bottom:1px solid var(--border)">
          <span>${i.categoryName} <span class="badge">${i.status}</span></span>
          <span>${fmt.format(i.budget)} ₺</span>
        </div>
      `).join('');

      el.innerHTML = `
        <div class="row between center">
          <div>
            <h2>${l.title}</h2>
            <div class="muted">${new Date(l.eventDate).toLocaleDateString('tr-TR')} · ${l.location || '-'}</div>
          </div>
          <div class="price">${fmt.format(l.totalBudget)} ₺</div>
        </div>
        <div style="margin:20px 0">
            <h3>İhtiyaç Listesi</h3>
            ${itemsHtml}
        </div>
        <p>${l.description || ''}</p>
        <div class="row gap" style="margin-top:20px">
          ${bidCta}
          <a class="btn" href="/Pazar-Alani">Benzer İlanlar</a>
        </div>
      `;

      const map = initLeafletMap('map', [l.latitude || 41.015137, l.longitude || 28.979530], l.latitude ? 13 : 11);
      if (l.latitude && l.longitude){
        const center = [l.latitude, l.longitude];
        const m = L.marker(center).addTo(map);
        const label = l.addressLabel || 'Etkinlik konumu';
        m.bindPopup(label).openPopup();
        
        // Çember varsa göster
        if (l.radius && l.radius > 0) {
          const circle = L.circle(center, {
            radius: l.radius,
            color: '#3388ff',
            fillColor: '#3388ff',
            fillOpacity: 0.2,
            weight: 2
          }).addTo(map);
          map.fitBounds(circle.getBounds());
          $('#mapLabel').textContent = `${label} (Yarıçap: ${Math.round(l.radius)} m)`;
        } else {
          $('#mapLabel').textContent = label;
        }
      } else {
        $('#mapLabel').textContent = 'Konum bilgisi henüz eklenmemiş.';
      }

      if (isVendorViewing) {
        const bidButton = el.querySelector('[data-detail-bid]');
        if (bidButton) {
          bidButton.addEventListener('click', () => openPazarBidModal(l.id));
        }
      }
      if (isOwner) {
        const bidsButton = el.querySelector('[data-detail-bids]');
        if (bidsButton) {
          bidsButton.addEventListener('click', (evt) => {
            evt.preventDefault();
            openListingBidsDialog(l.id);
          });
        }
      }
    } catch (err) {
      alert(err.message);
    }
  }

  // Vendor registration map
  window.initVendorMap = function(){
    const mapEl = $('#vendorMap');
    if (!mapEl) return;
    if (typeof L === 'undefined') {
      console.error('Leaflet kütüphanesi henüz yüklenmedi.');
      return;
    }
    
    // Eğer harita zaten varsa, önce destroy et
    if (window.vendorMapInstance) {
      window.vendorMapInstance.remove();
      window.vendorMapInstance = null;
    }
    
    const map = initLeafletMap('vendorMap');
    window.vendorMapInstance = map;
    let marker;
    
    // Harita boyutlarını yenile (hidden -> visible geçişinde gerekli)
    setTimeout(() => {
      map.invalidateSize();
    }, 100);
    
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (marker) marker.setLatLng([lat, lng]);
      else marker = L.marker([lat, lng]).addTo(map);
      const form = $('#registerForm');
      form.venueLat.value = lat;
      form.venueLng.value = lng;
    });
  }

  // Listing create map
  window.initListingCreateMap = function(){
    const mapEl = $('#listingMap');
    if (!mapEl) return;
    
    // Eğer harita zaten varsa, önce destroy et
    if (window.listingMapInstance) {
      window.listingMapInstance.remove();
      window.listingMapInstance = null;
    }
    
    const map = initLeafletMap('listingMap');
    window.listingMapInstance = map; // Global olarak sakla
    const form = $('#createListingForm');
    let marker = null;
    let circle = null;
    
    // Marker ve circle'ı global olarak sakla (temizleme için)
    window.listingMarker = null;
    window.listingCircle = null;

    function setViewOnMaps(centerLatLng, zoom){
      if (!centerLatLng) return;
      if (map && typeof map.setView === 'function') {
        map.setView(centerLatLng, zoom);
      }
    }

    async function geocodeDistrict(provinceName, districtName){
      const q = `${districtName}, ${provinceName}, Türkiye`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return null;
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isFinite(lat) || !isFinite(lon)) return null;
      return [lat, lon];
    }

    // İl/ilçe seçimi değişince haritayı o bölgeye odakla (işaretleme kullanıcı tıklaması ile)
    const provinceSelect = $('#provinceSelect');
    const districtSelect = $('#districtSelect');
    if (provinceSelect) {
      provinceSelect.addEventListener('change', async () => {
        const provinceName = (provinceSelect.value || '').trim();
        const districtName = districtSelect && !districtSelect.disabled
          ? (districtSelect.value || '').trim()
          : '';

        if (provinceName && districtName) {
          const coords = await geocodeDistrict(provinceName, districtName);
          if (coords) {
            setViewOnMaps(coords, 13);
            return;
          }
        }

        if (provinceName && TR_CITY_COORDS[provinceName]) {
          setViewOnMaps(TR_CITY_COORDS[provinceName], 11);
        }
      });
    }
    if (districtSelect) {
      districtSelect.addEventListener('change', async () => {
        const provinceName = (provinceSelect && provinceSelect.value || '').trim();
        const districtName = (districtSelect.value || '').trim();
        if (!provinceName || !districtName) return;
        const coords = await geocodeDistrict(provinceName, districtName);
        if (coords) {
          setViewOnMaps(coords, 13);
        }
      });
    }

    function updateCircle(center, radius) {
      // center bir array [lat, lng] veya Leaflet LatLng objesi olabilir
      const lat = Array.isArray(center) ? center[0] : center.lat;
      const lng = Array.isArray(center) ? center[1] : center.lng;
      
      // Geçerli koordinat kontrolü
      if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
        return; // Geçersiz koordinat, işlem yapma
      }
      
      const centerLatLng = [lat, lng];
      
      if (circle) {
        circle.setLatLng(centerLatLng);
        circle.setRadius(radius);
      } else {
        circle = L.circle(centerLatLng, {
          radius: radius,
          color: '#3388ff',
          fillColor: '#3388ff',
          fillOpacity: 0.2,
          weight: 2
        }).addTo(map);
        window.listingCircle = circle; // Global olarak sakla
      }
      if (marker) {
        marker.setLatLng(centerLatLng);
      } else {
        marker = L.marker(centerLatLng).addTo(map);
        window.listingMarker = marker; // Global olarak sakla
      }

      form.lat.value = lat;
      form.lng.value = lng;
    }

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      const radius = parseFloat(form.radius.value) || 1000;
      updateCircle([lat, lng], radius);
    });

    // Radius değiştiğinde çemberi güncelle
    const radiusInput = form.radius;
    if (radiusInput) {
      radiusInput.addEventListener('input', () => {
        const lat = parseFloat(form.lat.value);
        const lng = parseFloat(form.lng.value);
        if (form.lat.value && form.lng.value && !isNaN(lat) && !isNaN(lng)) {
          const radius = parseFloat(radiusInput.value) || 1000;
          updateCircle([lat, lng], radius);
        }
      });
    }

    // İlk yüklemede seçili il varsa haritayı oraya odakla
    setTimeout(() => {
      const provinceName = provinceSelect ? (provinceSelect.value || '').trim() : '';
      if (provinceName && TR_CITY_COORDS[provinceName]) {
        setViewOnMaps(TR_CITY_COORDS[provinceName], 11);
      }
      // hidden -> visible geçişlerinde layout sorunlarını azalt
      if (map && typeof map.invalidateSize === 'function') map.invalidateSize();
    }, 100);
  }

  async function updatePazarMapAndPlaces(list, selectedCity = '', options = {}){
    const mapEl = $('#pazarMap');
    const placesEl = $('#pazarPlaces');
    if (!mapEl || !placesEl) return;

    const skipPlacesPanel = !!(options && options.skipPlacesPanel);

    // Harita zaten varsa temizle, yoksa oluştur
    if (window.pazarMapInstance) {
      window.pazarMapInstance.remove();
      window.pazarMapInstance = null;
    }
    if (window.__activePlaceCard) {
      window.__activePlaceCard.classList.remove('pazar-place-card--active');
      window.__activePlaceCard = null;
    }

    // Seçilen şehrin koordinatları veya varsayılan (Ankara)
    let defaultCenter = [39.7800, 32.8000]; // Ankara/Gölbaşı (varsayılan)
    let defaultZoom = 6; // Türkiye genel görünümü
    
    if (selectedCity && TR_CITY_COORDS[selectedCity]) {
      defaultCenter = TR_CITY_COORDS[selectedCity];
      defaultZoom = 11; // Şehir yakınlaştırması
    }

    const map = initLeafletMap('pazarMap', defaultCenter, defaultZoom);
    window.pazarMapInstance = map;

    if (!skipPlacesPanel) {
      placesEl.innerHTML = '';
    }
    const bounds = L.latLngBounds([]);

    // 1) İlan marker'ları (sağ paneli etkilemez)
    const validListings = Array.isArray(list) ? list : [];
    const listingMarkerColor = 'var(--primary)';
    const listingWithCoords = validListings.filter(l => typeof l.latitude === 'number' && typeof l.longitude === 'number');
    listingWithCoords.forEach(l => {
      const marker = L.marker([l.latitude, l.longitude], {
        opacity: 0.95,
        icon: L.divIcon({
          className: 'listing-marker',
          html: `<div style="background-color:${listingMarkerColor};width:16px;height:16px;border-radius:4px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
          iconSize: [16, 16]
        })
      }).addTo(map);

      const budgetText = typeof l.totalBudget === 'number' ? `${fmt.format(l.totalBudget)} ₺` : '';
      marker.bindPopup(`
        <div style="font-size:13px;min-width:180px;">
          <strong>${l.title || 'İlan'}</strong><br>
          <span class="muted" style="font-size:11px;">${l.location || ''}</span><br>
          ${budgetText ? `<span style="font-size:12px;">${budgetText}</span>` : ''}
        </div>
      `);

      if (typeof l.radius === 'number' && l.radius > 0) {
        L.circle([l.latitude, l.longitude], {
          radius: l.radius,
          color: listingMarkerColor,
          fillColor: listingMarkerColor,
          fillOpacity: 0.12,
          weight: 2
        }).addTo(map);
      }

      bounds.extend([l.latitude, l.longitude]);
    });

    // 2) Mekanlar (sağ panel + mekan marker'ları)
    const vendorPlacesProvided = !!(options && Object.prototype.hasOwnProperty.call(options, 'vendorPlaces'));
    let vendorPlaces = [];
    if (vendorPlacesProvided) {
      vendorPlaces = Array.isArray(options.vendorPlaces) ? options.vendorPlaces : [];
    } else {
      vendorPlaces = (window.__pazarVendors || []);
      if (!Array.isArray(vendorPlaces) || vendorPlaces.length === 0) {
        try {
          vendorPlaces = await api('/api/vendors/map');
        } catch (err) {
          console.error('Vendor places load error:', err);
          vendorPlaces = [];
        }
      }
    }

    if (!skipPlacesPanel && vendorPlaces && vendorPlaces.length) {
      const section = document.createElement('div');
      section.className = 'pazar-vendor-section';

      const header = document.createElement('h4');
      header.textContent = 'Üye Mekanlar';
      header.style.margin = '0 0 8px';
      section.appendChild(header);

      const markerColor = '#7b1fa2';
      const canRate = role() === 'User' && !!token();

      vendorPlaces.forEach(v => {
        let marker = null;
        if (typeof v.latitude === 'number' && typeof v.longitude === 'number') {
          marker = L.marker([v.latitude, v.longitude], {
            opacity: 0.9,
            icon: L.divIcon({
              className: 'vendor-place-marker',
              html: `<div style="background-color:${markerColor};width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
              iconSize: [16, 16]
            })
          }).addTo(map);

          marker.bindPopup(`
            <div style="font-size:13px;min-width:180px;">
              <strong>${v.companyName}</strong><br>
              <span class="muted" style="font-size:11px;">${v.addressLabel || ''}</span><br>
              ${v.serviceCategories && v.serviceCategories.length ? `<span style="font-size:10px;">${v.serviceCategories.join(', ')}</span>` : ''}
            </div>
          `);

          bounds.extend([v.latitude, v.longitude]);
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.style.padding = '12px';
        card.style.marginBottom = '8px';
        card.style.borderLeft = `3px solid ${markerColor}`;
        card.style.backgroundColor = '#f7f2fb';

        if (v.coverPhotoUrl) {
          const coverWrap = document.createElement('div');
          coverWrap.className = 'pazar-vendor-cover';

          const img = document.createElement('img');
          img.className = 'pazar-vendor-cover-img';
          img.src = v.coverPhotoUrl;
          img.alt = `${v.companyName} fotoğrafı`;
          img.loading = 'lazy';
          coverWrap.appendChild(img);

          card.appendChild(coverWrap);
        }

        const title = document.createElement('strong');
        title.style.display = 'block';
        title.style.fontSize = '14px';
        title.style.color = markerColor;
        title.textContent = v.companyName;
        card.appendChild(title);

        // Rating (average)
        const avg = (typeof v.averageRating === 'number' && !Number.isNaN(v.averageRating))
          ? v.averageRating
          : null;
        const count = (typeof v.ratingCount === 'number' && Number.isFinite(v.ratingCount))
          ? v.ratingCount
          : 0;

        const ratingRow = document.createElement('div');
        ratingRow.className = 'vendor-rating-row';

        const stars = document.createElement('span');
        stars.className = 'rating-stars';
        const percent = avg ? Math.max(0, Math.min(100, (avg / 5) * 100)) : 0;
        stars.style.setProperty('--percent', `${percent}%`);
        if (avg && avg >= 4.999) {
          stars.classList.add('is-perfect');
        }
        stars.setAttribute('aria-label', avg ? `${avg.toFixed(1)} / 5` : 'Değerlendirme yok');
        ratingRow.appendChild(stars);

        const ratingText = document.createElement('span');
        ratingText.className = 'muted vendor-rating-text';
        ratingText.textContent = avg ? `${avg.toFixed(1)} (${count})` : '—';
        ratingRow.appendChild(ratingText);

        if (canRate) {
          stars.classList.add('rating-actionable');
          stars.title = 'Değerlendir (1-5)';
          stars.addEventListener('click', async (e) => {
            try {
              const rect = stars.getBoundingClientRect();
              const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
              const clicked = Math.ceil((x / rect.width) * 5);
              const payload = { rating: clicked };
              const res = await api(`/api/vendors/${v.userId}/rating`, { method: 'POST', body: JSON.stringify(payload) });
              const newAvg = (res && typeof res.averageRating === 'number') ? res.averageRating : null;
              const newCount = (res && typeof res.ratingCount === 'number') ? res.ratingCount : count;
              const newPercent = newAvg ? Math.max(0, Math.min(100, (newAvg / 5) * 100)) : 0;
              stars.style.setProperty('--percent', `${newPercent}%`);
              if (newAvg && newAvg >= 4.999) {
                stars.classList.add('is-perfect');
              } else {
                stars.classList.remove('is-perfect');
              }
              ratingText.textContent = newAvg ? `${newAvg.toFixed(1)} (${newCount})` : '—';
            } catch (err) {
              console.error('Rating submit error:', err);
              alert('Değerlendirme kaydedilemedi. Lütfen tekrar deneyin.');
            }
          });
        }

        card.appendChild(ratingRow);

        if (v.addressLabel) {
          const addr = document.createElement('div');
          addr.className = 'muted';
          addr.style.fontSize = '12px';
          addr.style.marginTop = '4px';
          addr.textContent = v.addressLabel;
          card.appendChild(addr);
        }

        if (Array.isArray(v.serviceCategories) && v.serviceCategories.length) {
          const catWrap = document.createElement('div');
          catWrap.style.marginTop = '6px';
          v.serviceCategories.forEach(cat => {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = cat;
            badge.style.marginRight = '4px';
            badge.style.marginBottom = '4px';
            catWrap.appendChild(badge);
          });
          card.appendChild(catWrap);
        }

        const meta = document.createElement('div');
        meta.style.display = 'flex';
        meta.style.flexWrap = 'wrap';
        meta.style.gap = '6px';
        meta.style.marginTop = '8px';

        if (v.isVerified) {
          const verified = document.createElement('span');
          verified.className = 'badge';
          verified.textContent = 'Onaylı Mekan';
          verified.style.backgroundColor = markerColor;
          verified.style.color = '#fff';
          meta.appendChild(verified);
        }

        if (v.venueType) {
          const venueType = document.createElement('span');
          venueType.className = 'badge';
          venueType.textContent = v.venueType;
          meta.appendChild(venueType);
        }

        if (v.capacity) {
          const cap = document.createElement('span');
          cap.className = 'badge';
          cap.textContent = `${v.capacity} Kişi`;
          meta.appendChild(cap);
        }

        if (v.priceRange) {
          const price = document.createElement('span');
          price.className = 'badge';
          price.textContent = v.priceRange;
          meta.appendChild(price);
        }

        if (v.website) {
          const link = document.createElement('a');
          link.href = v.website;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'Web';
          link.className = 'badge';
          meta.appendChild(link);
        }

        if (meta.children.length) {
          card.appendChild(meta);
        }

        if (marker) {
          attachPlaceCardInteraction(card, map, marker);
        }

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.marginTop = '10px';
        actions.innerHTML = `<a class="btn small primary" href="/Mekan/${v.userId}" onclick="event.stopPropagation()">Ziyaret Et</a>`;
        card.appendChild(actions);

        section.appendChild(card);
      });

      placesEl.appendChild(section);
    } else if (!skipPlacesPanel) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.marginBottom = '12px';
      empty.textContent = 'Henüz haritada gösterilecek üye mekan bulunmuyor.';
      placesEl.appendChild(empty);
    }

    if (!selectedCity && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2));
    }

    // Google Places mekanlarını yükle (sadece Ankara veya şehir seçilmemişse Gölbaşı mekanlarını göster)
    if (!skipPlacesPanel && (!selectedCity || selectedCity === 'Ankara')) {
      await loadGooglePlacesForGolbasi(map, placesEl, bounds);
    }

    // Sadece şehir seçilmemişse ve bounds geçerliyse fitBounds yap
    // Şehir seçildiyse zaten o şehre odaklandık
    if (!selectedCity && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2));
    }
  }

  // Google Places - Gölbaşı mekanları (sabit veri - API tüketimini azaltmak için)
  // Kategori: Düğün Salonları (Kırmızı - #ea4335)
  const GOLBASI_PLACES = [
    { name: "Kronos Gölbaşı Düğün Salonu", address: "Gaziosmanpaşa, Sahilyolu Caddesi 363 Sokak No:2/A, Gölbaşı", lat: 39.7741057, lng: 32.8038876, category: "wedding" },
    { name: "Life Park Düğün Salonu", address: "Gaziosmanpaşa, Ankara Gölbaşı Çıkışı 2. km, Gölbaşı", lat: 39.74828919999999, lng: 32.8035637, category: "wedding" },
    { name: "Akalın Balo Salonu", address: "Haymana yolu Bulvarı. 771. sokak Girişi, Gölbaşı", lat: 39.7935862, lng: 32.7934395, category: "wedding" },
    { name: "Rıhtım Riva Eymir", address: "Yaylabağ, Küme Evleri Caddesi No: 364/4, Gölbaşı", lat: 39.8193731, lng: 32.86080930000001, category: "wedding" },
    { name: "Hera Balo Salonları", address: "Karşıyaka, 768. Sk. no:8, Gölbaşı", lat: 39.7930717, lng: 32.7929687, category: "wedding" },
    { name: "pembe köşk balosalonları", address: "Karşıyaka, 777. Sk. No:19, Gölbaşı", lat: 39.7946777, lng: 32.7947502, category: "wedding" },
    { name: "Bahçeli Park Düğün Salonu", address: "Bahçelievler, 819. Sk. No:77, Gölbaşı", lat: 39.7864618, lng: 32.8166466, category: "wedding" },
    { name: "Göl Seyir Gölbaşı Kır Bahçesi & Balo Salonu", address: "Karşıyaka mahallesi no 166", lat: 39.7918057, lng: 32.7926646, category: "wedding" },
    { name: "Ankyra Event - Düğün Salonu", address: "Gaziosmanpaşa, Gölbaşı", lat: 39.7574209, lng: 32.803215, category: "wedding" },
    { name: "Florya Wedding", address: "Gaziosmanpaşa, Sahil Cd. No:22, Gölbaşı", lat: 39.78560969999999, lng: 32.8041042, category: "wedding" },
    { name: "Elite Wedding Hall", address: "Karşıyaka, Haymana Yolu Blv. No:182, Gölbaşı", lat: 39.7889789, lng: 32.79171, category: "wedding" },
    { name: "GÖLDE LUXE WEDDİNG & EVENTS", address: "Karşıyaka mahalleesi, Haymana Yolu Bulvarı, no:208, Gölbaşı", lat: 39.7857873, lng: 32.789362, category: "wedding" },
    { name: "villadestewedding", address: "Karşıyaka, 712. Sk. no:1, Gölbaşı", lat: 39.7856, lng: 32.7891392, category: "wedding" },
    { name: "Panorama Wedding & Event Gölbaşı Düğün Salonu", address: "3.km, Karşıyaka, Haymana Yolu Blv. No:21, Gölbaşı", lat: 39.7814823, lng: 32.7878482, category: "wedding" },
    { name: "YESS BALO VE DAVET SALONLARI", address: "Karşıyaka, 730/1. Sk. no 5, Gölbaşı", lat: 39.7889595, lng: 32.7909736, category: "wedding" },
    { name: "ÇIRAĞAN MOGAN", address: "Sok, Karşıyaka, Haymana Yolu Blv. No: no:115, Gölbaşı", lat: 39.7915553, lng: 32.7936134, category: "wedding" },
    { name: "Gölbaşı Akalın Wedding Plaza", address: "Karşıyaka Haymana Yolu Bulvarı, Gölbaşı", lat: 39.7937815, lng: 32.7942841, category: "wedding" },
    { name: "ÜLGER KONAĞI KIR BAHÇESİ", address: "Bahçelievler, 6. Sk. Numara:21, Gölbaşı", lat: 39.7496271, lng: 32.8115863, category: "wedding" }
  ];

  // Kategori: Fotoğrafçılar (Mavi - #4285f4)
  const PHOTOGRAPHERS = [
    { name: "İncek Boğaz Ankara Fotoğraf Platosu", address: "Taşpınar Mahallesi No:1/B, Gölbaşı", lat: 39.8009126, lng: 32.7822562, category: "photographer" },
    { name: "Düğüne Gel", address: "Seğmenler, Seğmenler Cd. No:62/A, Gölbaşı", lat: 39.793081, lng: 32.815683, category: "photographer" },
    { name: "Baris Film & Fotoğrafçılık", address: "Karşıyaka, 765. Sk. No:6, Gölbaşı", lat: 39.793845, lng: 32.792733, category: "photographer" },
    { name: "Foto Turgut Acele Vesikalik", address: "Bahçelievler, Gölbaşı", lat: 39.787015, lng: 32.80821350000001, category: "photographer" },
    { name: "Foto Yıldız", address: "Bahçelievler, 297. Sk. D:3-E, Gölbaşı", lat: 39.7899945, lng: 32.8107502, category: "photographer" },
    { name: "Asonka Fotoğraf Stüdyosu", address: "Bahçelievler, 278. Sk. No:11 D:E, Gölbaşı", lat: 39.7902684, lng: 32.8081983, category: "photographer" },
    { name: "Uzay Photography", address: "Seğmenler, 927. Sk. NO:17, Gölbaşı", lat: 39.7930466, lng: 32.8093642, category: "photographer" },
    { name: "Renko Fotoğrafçılık", address: "Karşıyaka, 765. Sk. no: 6, Gölbaşı", lat: 39.7938569, lng: 32.7928349, category: "photographer" },
    { name: "Kuzey Fotoğraf", address: "Bahçelievler, 278. Sk. 11/A, Gölbaşı", lat: 39.7904467, lng: 32.807894, category: "photographer" },
    { name: "Studyo S&S Gölbaşı", address: "Seğmenler, Oğuz Kağan Usta Cd 47b a, Gölbaşı", lat: 39.7937051, lng: 32.8109443, category: "photographer" },
    { name: "Alper Color Fotoğraf Stüdyosu", address: "Gaziosmanpaşa, 377. Sk. No:9 D:B, Gölbaşı", lat: 39.7918267, lng: 32.8044829, category: "photographer" },
    { name: "Ankara Düğün Fotoğrafçısı Art Prodüksiyon", address: "Karşıyaka, Haymana Yolu Blv. No:182, Gölbaşı", lat: 39.7895519, lng: 32.7920694, category: "photographer" },
    { name: "SARAÇOĞLU MEDYA", address: "Gaziosmanpaşa, Ankara Cd. Gölbaşı Ticaret Merkezi, Gölbaşı", lat: 39.7924382, lng: 32.8056726, category: "photographer" },
    { name: "stüdyo anılar 2", address: "Seğmenler, 927. Sk. no:18/B, Gölbaşı", lat: 39.792884, lng: 32.8095278, category: "photographer" }
  ];

  // Kategori: Pastaneler (Yeşil - #34a853)
  const BAKERIES = [
    { name: "Ekmeek – Fırın Pasta Cafe", address: "Bahçelievler, 281. Cadde 98G, Gölbaşı", lat: 39.7894783, lng: 32.8108558, category: "bakery" },
    { name: "Gölbaşı ekleristan", address: "Seğmenler, Cumhuriyet Cd. no:41/c, Gölbaşı", lat: 39.7929139, lng: 32.8090591, category: "bakery" },
    { name: "Mozi Pastanesi", address: "Gaziosmanpaşa, 377. Sk. No:17, Gölbaşı", lat: 39.7924103, lng: 32.8054152, category: "bakery" },
    { name: "UMUT NAMZET PASTA CAFE", address: "Bahçelievler, Cemal Gürsel Cd. 18/B, Gölbaşı", lat: 39.7893891, lng: 32.8075677, category: "bakery" },
    { name: "İSA NAMZET PASTA CAFE", address: "Gazi Osman paşa mahallesi Hükümet cad. No :7/A, Gölbaşı", lat: 39.7913856, lng: 32.805424, category: "bakery" },
    { name: "Mogan Pastanesi", address: "Eymir, Manyas Gölü Cd. No:4 D:7, Gölbaşı", lat: 39.8073039, lng: 32.8467736, category: "bakery" },
    { name: "Hacı Baki Gölbaşı", address: "Bahçelievler, Cumhuriyet Cd. 18/A, Gölbaşı", lat: 39.7890652, lng: 32.8081265, category: "bakery" },
    { name: "Damla Fırın Pasta", address: "Bahçelievler, 281. Cadde No 27 D:A, Gölbaşı", lat: 39.7905408, lng: 32.8090491, category: "bakery" },
    { name: "Villa Cakes", address: "Karşıyaka, 612 Cd. No:44, Gölbaşı", lat: 39.7867818, lng: 32.7915009, category: "bakery" },
    { name: "Pastane Sinan", address: "Eymir, 832. Sk. No:8 D:B, Gölbaşı", lat: 39.8073181, lng: 32.8461677, category: "bakery" }
  ];

  // Kategori: Çiçekçiler (Turuncu - #fbbc04)
  const FLORISTS = [
    { name: "Orkide çiçekçilik", address: "Karşıyaka, 768. Sk. No:3, Gölbaşı", lat: 39.7933956, lng: 32.792961, category: "florist" },
    { name: "çiçek dünyası", address: "Bahçelievler, 306. Sk. No:3, Gölbaşı", lat: 39.7866858, lng: 32.8078177, category: "florist" },
    { name: "Gölbaşı Çiçek-Süs Bitkileri", address: "Seğmenler, Cemal Gürsel Cd. no:7, Gölbaşı", lat: 39.791823, lng: 32.8068527, category: "florist" },
    { name: "Beyaz Saray Çiçekçilik", address: "Bahçelievler, 278. Sk. 17B, Gölbaşı", lat: 39.7902507, lng: 32.8077823, category: "florist" },
    { name: "Gölbaşı çiçekçilik", address: "Bahçelievler, 281. Cadde No:21, Gölbaşı", lat: 39.7895565, lng: 32.810194, category: "florist" },
    { name: "Uzay Çiçekçilik", address: "Bahçelievler, 296. Sk. no:6, Gölbaşı", lat: 39.7897701, lng: 32.8089291, category: "florist" },
    { name: "Azra çiçek", address: "Seğmenler, Cemal Gürsel Cd. 11/B, Gölbaşı", lat: 39.7919706, lng: 32.806815, category: "florist" }
  ];

  // Kategori renkleri
  const CATEGORY_COLORS = {
    wedding: { color: '#ea4335', bg: '#fff5f5', label: '💒 Düğün Salonu', icon: '🏛️' },
    photographer: { color: '#4285f4', bg: '#f5f9ff', label: '📷 Fotoğrafçı', icon: '📸' },
    bakery: { color: '#34a853', bg: '#f5fff7', label: '🍰 Pastane', icon: '🎂' },
    florist: { color: '#fbbc04', bg: '#fffdf5', label: '🌸 Çiçekçi', icon: '💐' }
  };

  // Ankara/Gölbaşı mekanlarını yükle (sabit veri + yerel görseller)
  async function loadGooglePlacesForGolbasi(map, placesContainer, bounds) {
    try {
      const resolved = [
        { key: 'wedding', places: Array.isArray(GOLBASI_PLACES) ? GOLBASI_PLACES : [] },
        { key: 'photographer', places: Array.isArray(PHOTOGRAPHERS) ? PHOTOGRAPHERS : [] },
        { key: 'bakery', places: Array.isArray(BAKERIES) ? BAKERIES : [] },
        { key: 'florist', places: Array.isArray(FLORISTS) ? FLORISTS : [] }
      ];

      const allPlaces = resolved.flatMap(d => d.places);
      console.log(`Yerel mekan listesi: ${allPlaces.length} mekan yüklendi`);

      const placesEl = placesContainer || $('#pazarPlaces');
      const placeCards = [];
      const placeMarkers = [];
      let activeCategoryFilter = null;

      const applyCategoryFilter = (category) => {
        placeCards.forEach(card => {
          card.style.display = !category || card.dataset.category === category ? 'block' : 'none';
        });
        placeMarkers.forEach(({ category: markerCategory, marker }) => {
          const shouldDim = category && markerCategory !== category;
          if (marker && typeof marker.setOpacity === 'function') {
            marker.setOpacity(shouldDim ? 0.25 : 0.85);
          }
        });
      };

      let section = null;
      let listsWrapper = null;
      if (placesEl) {
        section = document.createElement('div');
        section.className = 'pazar-google-section';

        listsWrapper = document.createElement('div');
        listsWrapper.className = 'pazar-google-categories';
        listsWrapper.style.display = 'flex';
        listsWrapper.style.flexDirection = 'column';
        listsWrapper.style.gap = '12px';
        section.appendChild(listsWrapper);
      }

      resolved.forEach(dataset => {
        const catStyle = CATEGORY_COLORS[dataset.key];
        if (!catStyle || !dataset.places.length) return;

        let categoryBlock = null;
        if (listsWrapper) {
          categoryBlock = document.createElement('div');
          categoryBlock.className = 'pazar-google-category';
          categoryBlock.style.background = '#fff';
          categoryBlock.style.borderRadius = '12px';
          categoryBlock.style.border = '1px solid var(--border, #eee)';
          categoryBlock.style.padding = '12px';
          categoryBlock.style.boxShadow = '0 1px 3px rgba(15,15,15,0.08)';

          const blockHeader = document.createElement('div');
          blockHeader.style.display = 'flex';
          blockHeader.style.alignItems = 'center';
          blockHeader.style.justifyContent = 'space-between';
          blockHeader.style.marginBottom = '8px';
          blockHeader.innerHTML = `
            <strong style="color:${catStyle.color};">${catStyle.icon} ${catStyle.label}</strong>
            <span class="badge" style="background:${catStyle.color};color:#fff;">${dataset.places.length}</span>
          `;
          categoryBlock.appendChild(blockHeader);

          listsWrapper.appendChild(categoryBlock);
        }

        dataset.places.forEach(place => {
          const marker = L.marker([place.lat, place.lng], {
            opacity: 0.85,
            icon: L.divIcon({
              className: 'google-place-marker',
              html: `<div style="background-color:${catStyle.color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
              iconSize: [14, 14]
            })
          }).addTo(map);

          marker.bindPopup(`
            <div style="font-size:13px;">
              <strong>${place.name}</strong><br>
              <span class="muted" style="font-size:11px;">${place.address || ''}</span><br>
              <span style="color:${catStyle.color};font-size:10px;">${catStyle.icon} ${catStyle.label}</span>
            </div>
          `);

          if (bounds) {
            bounds.extend([place.lat, place.lng]);
          }

          placeMarkers.push({ category: dataset.key, marker });

          if (categoryBlock) {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.padding = '10px';
            card.style.marginBottom = '8px';
            card.style.backgroundColor = catStyle.bg;
            card.style.borderLeft = `3px solid ${catStyle.color}`;
            card.dataset.category = dataset.key;

            card.innerHTML = `
              <strong style="font-size:14px; color:${catStyle.color};">${catStyle.icon} ${place.name}</strong>
              <div class="muted" style="font-size:12px; margin-top:4px;">${place.address || 'Adres bilgisi yok'}</div>
              <div style="font-size:10px; margin-top:4px; color:${catStyle.color};">Gölbaşı / Ankara</div>
            `;

            const photoEl = createCategoryImageElement(dataset.key, place.photoReference, 640, 360, '', place.name);
            photoEl.style.width = '100%';
            photoEl.style.height = '120px';
            photoEl.style.objectFit = 'cover';
            photoEl.style.borderRadius = '10px';
            photoEl.style.marginBottom = '8px';
            card.insertBefore(photoEl, card.firstChild);
            attachPlaceCardInteraction(card, map, marker);
            categoryBlock.appendChild(card);
            placeCards.push(card);
          }
        });
      });

      applyCategoryFilter(activeCategoryFilter);

      if (section && placesEl) {
        placesEl.appendChild(section);
      }
    } catch (err) {
      console.error('Google Places yükleme hatası:', err);
    }
  }

  // Page wiring
  document.addEventListener('DOMContentLoaded', async () => {
    setAuthUI();
    initPazarBidDialogBase();

    // /home - Mekan görselleri akışı (hata alsa bile diğer init'lerden bağımsız çalışsın)
    if ($('#homeVenueTrack')) {
      initHomeVenueStream().catch(err => {
        console.warn('initHomeVenueStream başarısız:', err);
        const track = $('#homeVenueTrack');
        if (track && !track.querySelector('img')) {
          track.innerHTML = '<div class="muted" style="padding:12px;">Şu an mekan görselleri yüklenemedi.</div>';
        }
      });
    }

    // Navbar: hide on scroll down, show on scroll up
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      let lastY = window.scrollY || 0;
      let ticking = false;
      const threshold = 10;
      const minShowAt = 8;

      const update = () => {
        const y = window.scrollY || 0;
        const delta = y - lastY;

        if (y <= minShowAt) {
          topbar.classList.remove('is-hidden');
        } else if (Math.abs(delta) >= threshold) {
          if (delta > 0) topbar.classList.add('is-hidden');
          else topbar.classList.remove('is-hidden');
        }

        lastY = y;
        ticking = false;
      };

      window.addEventListener('scroll', () => {
        if (!ticking) {
          window.requestAnimationFrame(update);
          ticking = true;
        }
      }, { passive: true });
    }

    // /home hero: şehir seç + listele
    const homeServiceBtn = $('#homeServiceSelectBtn');
    const homeServiceMenu = $('#homeServiceMenu');
    const homeCityBtn = $('#homeCitySelectBtn');
    const homeCityMenu = $('#homeCityMenu');
    const homeListBtn = $('#homeListBtn');
    if (homeServiceBtn && homeServiceMenu && homeCityBtn && homeCityMenu && homeListBtn) {
      const HOME_SERVICES = [
        'Evlilik Teklifi',
        'Düğün',
        'Nişan',
        'Kına',
        'Doğum Günü',
        'Kurumsal Etkinlik'
      ];

      const closeAllHomeMenus = () => {
        homeServiceMenu.classList.remove('open');
        homeCityMenu.classList.remove('open');
        homeServiceBtn.setAttribute('aria-expanded', 'false');
        homeCityBtn.setAttribute('aria-expanded', 'false');
      };

      const initHomeDropdown = (buttonEl, menuEl, options) => {
        buttonEl.dataset.value = '';
        menuEl.innerHTML = options
          .map(v => `<button type="button" class="home-hero-option" role="option" data-value="${String(v).replace(/"/g, '&quot;')}">${v}</button>`)
          .join('');

        buttonEl.addEventListener('click', (e) => {
          e.preventDefault();
          const isOpen = menuEl.classList.contains('open');
          closeAllHomeMenus();
          if (!isOpen) {
            menuEl.classList.add('open');
            buttonEl.setAttribute('aria-expanded', 'true');
          }
        });

        menuEl.addEventListener('click', (e) => {
          const target = e.target && e.target.closest ? e.target.closest('.home-hero-option') : null;
          if (!target) return;
          const value = (target.getAttribute('data-value') || '').trim();
          buttonEl.dataset.value = value;
          buttonEl.textContent = value || 'Seçin';
          closeAllHomeMenus();
        });
      };

      initHomeDropdown(homeServiceBtn, homeServiceMenu, HOME_SERVICES);
      initHomeDropdown(homeCityBtn, homeCityMenu, TR_LOCATIONS);

      document.addEventListener('click', (e) => {
        const clickedInside = e.target && e.target.closest && e.target.closest('.home-hero-field');
        if (!clickedInside) closeAllHomeMenus();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllHomeMenus();
      });

      homeListBtn.addEventListener('click', () => {
        const service = (homeServiceBtn.dataset.value || '').trim();
        const city = (homeCityBtn.dataset.value || '').trim();
        const params = new URLSearchParams();
        if (city) params.set('location', city);

        // Home'daki "Nasıl Yardımcı Olabiliriz?" seçenekleri bir "Ne için?" (event purpose)
        // filtresi gibi davranır; bu yüzden Pazar Alanı'nda "Hizmet" sekmesine yönlendiriyoruz.
        if (service) {
          params.set('type', 'hizmet');
          params.set('purpose', service);
        } else {
          // Sadece şehir seçildiyse ilanları o konuma göre filtrelemek daha mantıklı.
          params.set('type', 'ilan');
        }

        const target = '/Pazar-Alani' + (params.toString() ? `?${params.toString()}` : '');
        window.location.href = target;
      });
    }

    // logout
    const logout = $('#logoutBtn');
    if (logout) logout.addEventListener('click', () => { localStorage.clear(); window.location.href = '/home'; });

    // Index - Homepage carousel (filtre olmadan)
    if ($('#listingCarousel')) {
      // Tüm ilanları yükle (filtre yok)
      await loadHomepageListings();
      // Live stats sayaç animasyonu
      initLiveStatsCounter();
    }

    // /home - Aktif ilan akışı
    if ($('#homeListingTrack')) {
      await initHomeListingsStream();
    }
    
    // Pazar Alanı sayfası
    if ($('#pazarListingGrid')) {
      ensurePazarBidButtonBinding();

      const listingCat = $('#pazarListingCategory');
      if (listingCat) await loadCategories(listingCat);

      const purposeSel = $('#pazarServicePurpose');
      if (purposeSel) loadEventPurposes(purposeSel, 'Ne için? (hepsi)');

      const serviceCatSel = $('#pazarServiceCategory');
      if (serviceCatSel) await loadCategoriesAsNames(serviceCatSel, 'Kategori (hepsi)');

      const listingLoc = $('#pazarListingLocation');
      if (listingLoc) {
        listingLoc.innerHTML = '<option value="">Konum (hepsi)</option>' +
          TR_LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('');
      }

      const serviceLoc = $('#pazarServiceLocation');
      if (serviceLoc) {
        serviceLoc.innerHTML = '<option value="">Konum (hepsi)</option>' +
          TR_LOCATIONS.map(l => `<option value="${l}">${l}</option>`).join('');
      }

      // QueryString -> prefill + ilk arama
      const qs = new URLSearchParams(window.location.search);
      const normalizeTr = (v) => String(v || '')
        .trim()
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');

      const findSelectValue = (selectEl, desired) => {
        if (!selectEl || !desired) return '';
        const desiredNorm = normalizeTr(desired);
        const opts = Array.from(selectEl.options || []);
        const hit = opts.find(o => normalizeTr(o.value) === desiredNorm || normalizeTr(o.textContent) === desiredNorm);
        return hit ? hit.value : '';
      };

      const qsTypeRaw = normalizeTr(qs.get('type') || '');
      const qsLocation = (qs.get('location') || '').trim();
      const qsPurpose = (qs.get('purpose') || '').trim();
      const qsListingQ = (qs.get('q') || '').trim();
      const qsServiceTerm = (qs.get('service') || '').trim();

      let shouldAutoSearch = false;

      if (qsTypeRaw === 'hizmet' || qsTypeRaw === 'ilan') {
        window.__pazarSearchType = qsTypeRaw;
      }

      if (qsLocation) {
        if (listingLoc) listingLoc.value = qsLocation;
        if (serviceLoc) serviceLoc.value = qsLocation;
        shouldAutoSearch = true;
      }

      const listingQEl = $('#pazarListingQ');
      if (qsListingQ && listingQEl) {
        listingQEl.value = qsListingQ;
        if (!window.__pazarSearchType) window.__pazarSearchType = 'ilan';
        shouldAutoSearch = true;
      }

      const serviceTermEl = $('#pazarServiceTerm');
      if (qsServiceTerm && serviceTermEl) {
        serviceTermEl.value = qsServiceTerm;
        if (!window.__pazarSearchType) window.__pazarSearchType = 'hizmet';
        shouldAutoSearch = true;
      }

      if (qsPurpose && purposeSel) {
        const match = findSelectValue(purposeSel, qsPurpose);
        if (match) {
          purposeSel.value = match;
          if (!window.__pazarSearchType) window.__pazarSearchType = 'hizmet';
          shouldAutoSearch = true;
        }
      }

      bindPazarTypeToggle();
      const searchBtn = $('#searchBtnPazar');
      if (searchBtn) searchBtn.addEventListener('click', () => searchPazarDispatch());

      const showAllBtn = $('#showAllBtnPazar');
      if (showAllBtn) showAllBtn.addEventListener('click', () => showAllPazar());

      setPazarSearchType(window.__pazarSearchType || 'ilan');
      if (shouldAutoSearch) {
        await searchPazarDispatch();
      } else {
        await showAllPazar();
      }

      const listingsPanel = document.getElementById('pazarListingsPanel');
      const toggleBtn = document.getElementById('pazarListingsToggle');
      const placesPanel = document.getElementById('pazarPlacesPanel');
      const placesToggleBtn = document.getElementById('pazarPlacesToggle');
      const layoutSection = document.querySelector('.pazar-layout');
      if (listingsPanel && toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          // If places panel is expanded, collapse it first
          if (layoutSection) {
            layoutSection.classList.remove('expanded-places-hidden-map');
          }
          if (placesToggleBtn) {
            placesToggleBtn.textContent = '← Geniş Görünüm';
          }

          const expanded = listingsPanel.classList.toggle('pazar-listings-expanded');
          if (layoutSection) {
            layoutSection.classList.toggle('expanded-map-hidden', expanded);
          }
          toggleBtn.textContent = expanded ? '← Dar Görünüm' : 'Geniş Görünüm →';
        });
      }

      if (placesPanel && placesToggleBtn && layoutSection) {
        placesToggleBtn.addEventListener('click', () => {
          // If listings panel is expanded, collapse it first
          listingsPanel.classList.remove('pazar-listings-expanded');
          layoutSection.classList.remove('expanded-map-hidden');
          if (toggleBtn) toggleBtn.textContent = 'Geniş Görünüm →';

          const expanded = layoutSection.classList.toggle('expanded-places-hidden-map');
          placesToggleBtn.textContent = expanded ? 'Dar Görünüm →' : '← Geniş Görünüm';
        });
      }
    }

    // Marketplace sayfası
    if ($('#marketplaceGrid')) {
      await loadCategories($('#category'));

      const qs = new URLSearchParams(window.location.search);
      const qParam = (qs.get('q') || '').trim();
      const locationParam = (qs.get('location') || '').trim();
      const categoryIdParam = (qs.get('categoryId') || '').trim();
      const minBudgetParam = (qs.get('minBudget') || '').trim();
      const maxBudgetParam = (qs.get('maxBudget') || '').trim();

      if ($('#q') && qParam) $('#q').value = qParam;
      if ($('#location') && locationParam) $('#location').value = locationParam;
      if ($('#category') && categoryIdParam) $('#category').value = categoryIdParam;
      if ($('#minBudget') && minBudgetParam) $('#minBudget').value = minBudgetParam;
      if ($('#maxBudget') && maxBudgetParam) $('#maxBudget').value = maxBudgetParam;

      const btn = $('#searchBtnMarketplace');
      if (btn) btn.addEventListener('click', searchMarketplace);

      await searchMarketplace();
    }

    // Login
    if ($('#loginForm')) {
      // Zaten giriş yapmışsa dashboard'a yönlendir
      if (token() && role()) {
        window.location.href = dashboardPathForRole(role());
        return;
      }
      $('#loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const payload = {
          email: form.email.value.trim(),
          password: form.password.value
        };
        try{
          const res = await api('/api/auth/login', { method:'POST', body: JSON.stringify(payload) });
          localStorage.setItem('token', res.token);
          localStorage.setItem('role', res.role);
          localStorage.setItem('displayName', res.displayName);
          if (res.userId) localStorage.setItem('userId', res.userId);
          window.location.href = dashboardPathForRole(res.role);
        }catch(err){ 
          console.error('Login error:', err);
          alert('Hata: ' + (err.message || 'Giriş yapılamadı. Lütfen tekrar deneyin.'));
        }
      });
    }

    // Register
    if ($('#registerForm')) {
      // Zaten giriş yapmışsa dashboard'a yönlendir
      if (token() && role()) {
        window.location.href = dashboardPathForRole(role());
        return;
      }
      $('#registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        // Role değerini enum'a uygun hale getir
        const allowedRoles = ['User', 'Vendor', 'Admin'];
        const rawRole = form.role.value;
        const roleValue = allowedRoles.includes(rawRole) ? rawRole : 'User';
        
        const payload = {
          email: form.email.value.trim(),
          password: form.password.value,
          displayName: form.displayName.value.trim(),
          role: roleValue,
          companyName: form.companyName ? form.companyName.value.trim() || null : null,
          serviceCategoriesCsv: form.serviceCategoriesCsv ? form.serviceCategoriesCsv.value.trim() || null : null,
          venueLatitude: form.venueLat ? parseFloat(form.venueLat.value || 'NaN') : null,
          venueLongitude: form.venueLng ? parseFloat(form.venueLng.value || 'NaN') : null,
          venueAddressLabel: form.venueAddressLabel ? form.venueAddressLabel.value.trim() || null : null
        };
        // cleanup NaN
        if (Number.isNaN(payload.venueLatitude)) payload.venueLatitude = null;
        if (Number.isNaN(payload.venueLongitude)) payload.venueLongitude = null;
        
        // Validation
        if (!payload.email || !payload.password || !payload.displayName) {
          alert('Lütfen tüm zorunlu alanları doldurun.');
          return;
        }
        if (payload.password.length < 6) {
          alert('Şifre en az 6 karakter olmalıdır.');
          return;
        }
        if (roleValue === 'Vendor') {
          if (!payload.companyName) {
            alert('Kurumsal hesaplar için firma/mekan adı zorunludur.');
            return;
          }
          if (!payload.serviceCategoriesCsv) {
            alert('Lütfen en az bir hizmet kategorisi seçin.');
            return;
          }
        }
        
        console.log('Register payload:', payload);
        try{
          const res = await api('/api/auth/register', { method:'POST', body: JSON.stringify(payload) });
          localStorage.setItem('token', res.token);
          localStorage.setItem('role', res.role);
          localStorage.setItem('displayName', res.displayName);
          if (res.userId) localStorage.setItem('userId', res.userId);
          window.location.href = dashboardPathForRole(res.role);
        }catch(err){ 
          console.error('Registration error:', err);
          alert('Hata: ' + (err.message || 'Kayıt olunamadı. Lütfen tekrar deneyin.'));
        }
      });
    }

    // User dashboard
    if ($('#createListingForm')) {
      if (!(await ensureAuth('User'))) return;
      await loadUserCategories(); // Load categories for dynamic rows
      let locationControls = null;
      initUserLocationSelectors()
        .then(ctrl => { locationControls = ctrl; })
        .catch(err => console.warn('Konum seçim bileşeni yüklenemedi:', err));

      const myListingsEl = $('#myListings');

      // Dynamic Rows Logic
      const itemsContainer = $('#itemsContainer');
      const addItemBtn = $('#addItemBtn');

      if (!itemsContainer || !addItemBtn) {
        console.error('Items container or Add button not found in DOM');
        return;
      }

      if (!window.__categories || !window.__categories.length) {
        alert('Kategoriler yüklenemedi. Lütfen sayfayı yenileyin.');
        return;
      }

      function addItemRow() {
        const row = document.createElement('div');
        row.className = 'row gap center item-row';
        row.style.marginBottom = '10px';
        
        const catOptions = window.__categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        
        row.innerHTML = `
          <select class="input item-cat" required>
            <option value="">Kategori Seçin</option>
            ${catOptions}
          </select>
          <input type="number" class="input item-budget" placeholder="Bütçe (₺)" required min="1" />
          <button type="button" class="btn small danger remove-item">Sil</button>
        `;
        
        row.querySelector('.remove-item').addEventListener('click', () => {
          if (itemsContainer.children.length > 1) row.remove();
          else alert('En az bir kalem olmalıdır.');
        });
        
        itemsContainer.appendChild(row);
      }

      addItemBtn.addEventListener('click', addItemRow);
      addItemRow(); // Add first row initially

      $('#createListingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (!form.lat.value || !form.lng.value) { alert('Lütfen haritadan konum seçiniz.'); return; }
        
        // Collect items
        const items = [];
        $$('.item-row').forEach(row => {
          const catId = row.querySelector('.item-cat').value;
          const budget = row.querySelector('.item-budget').value;
          if (catId && budget) {
            items.push({ categoryId: parseInt(catId), budget: parseFloat(budget) });
          }
        });

        if (items.length === 0) { alert('Lütfen en az bir kalem ekleyin.'); return; }

        const eventDate = form.eventDate.value ? new Date(form.eventDate.value + 'T00:00:00Z').toISOString() : null;
        
        const payload = {
          title: form.title.value,
          description: form.description.value,
          eventDate: eventDate,
          location: form.location.value,
          items: items, // New items array
          latitude: parseFloat(form.lat.value),
          longitude: parseFloat(form.lng.value),
          radius: form.radius ? parseFloat(form.radius.value) || null : null,
          addressLabel: form.addressLabel.value || null
        };
        try{
          const result = await api('/api/listings', { method:'POST', body: JSON.stringify(payload) });
          alert('İlan oluşturuldu.');
          
          // Marker ve circle'ı temizle
          if (window.listingMapInstance) {
            if (window.listingMarker) {
              window.listingMapInstance.removeLayer(window.listingMarker);
              window.listingMarker = null;
            }
            if (window.listingCircle) {
              window.listingMapInstance.removeLayer(window.listingCircle);
              window.listingCircle = null;
            }
          }
          
          form.reset();
          // Reset items to 1 row
          itemsContainer.innerHTML = '';
          addItemRow();
          if (locationControls && typeof locationControls.reset === 'function') {
            locationControls.reset();
          }
          
          // Form alanlarını temizle
          form.lat.value = '';
          form.lng.value = '';

          if (myListingsEl) {
            await loadMyListings();
          }
        }catch(err){ 
          console.error('Listing creation error:', err);
          alert('Hata: ' + (err.message || 'İlan oluşturulamadı. Lütfen tekrar deneyin.'));
        }
      });

      async function loadMyListings(){
        if (!myListingsEl) return;
        const list = await api('/api/listings/mine');
        myListingsEl.innerHTML = list.map(myListingCard).join('');
        $$('#myListings [data-bids]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-bids');
            const bids = await api(`/api/listings/${id}/bids`);
            const bc = $('#bidsContainer');
            if (bc) {
              bc.innerHTML = bids.length ? bids.map(bidCard).join('') : '<div class="muted">Henüz teklif yok.</div>';
              bindBidCallPopups(bc);
            }
            // accept
            $$('#bidsContainer [data-accept]').forEach(ab => {
              ab.addEventListener('click', async () => {
                if (!confirm('Bu teklifi kabul etmek ister misiniz?')) return;
                await api(`/api/bids/${ab.getAttribute('data-accept')}/accept`, { method:'POST' });
                await loadMyListings();
                $('#bidsDialog').close();
              });
            });
            $('#bidsDialog').showModal();
          });
        });
      }
      if (myListingsEl) {
        await loadMyListings();
      }
    }

    // Vendor dashboard
    if ($('#vendorProfileForm')) {
      if (!(await ensureAuth('Vendor'))) return;

      const openListingsEl = $('#openListings');
      if (openListingsEl) {
        loadOpen = async function(){
          const list = await api('/api/listings');
          openListingsEl.innerHTML = list.map(l => {
          // Generate checkboxes for items
          const itemsCheckboxes = l.items.map(i => `
            <div class="row center gap" style="margin-bottom:4px">
              <input type="checkbox" name="item_${i.id}" value="${i.id}" data-budget="${i.budget}" class="item-checkbox" />
              <label>${i.categoryName} (${fmt.format(i.budget)} ₺)</label>
              <input type="number" name="amount_${i.id}" class="input small bid-amount" placeholder="Teklif" style="width:100px" disabled />
            </div>
          `).join('');

          return `
          <div class="card listing-card vendor-listing-card" data-listing-id="${l.id}">
            <div class="row between center">
              <span class="badge">${l.items.map(i => i.categoryName).join(', ')}</span>
              <span class="badge">${l.location || '-'}</span>
            </div>
            <h4>${l.title}</h4>
            <p class="muted">${l.description ? l.description.slice(0,120) : ''}</p>
            <div class="row between center">
              <small>${new Date(l.eventDate).toLocaleDateString('tr-TR')}</small>
              <small class="price">Toplam Bütçe: ${fmt.format(l.totalBudget)} ₺</small>
            </div>
            <div class="row gap">
              <a class="btn small" href="/Listings/Detail?id=${l.id}">Detay</a>
            </div>
            <form class="form" data-bid="${l.id}" style="margin-top:10px; border-top:1px solid var(--border); padding-top:10px">
              <strong>Teklif Verilecek Kalemler:</strong>
              ${itemsCheckboxes}
              <input name="message" class="input" placeholder="Mesaj (opsiyonel)" />
              <button class="btn small primary" type="submit">Teklif Gönder</button>
            </form>
          </div>
        `}).join('');

        // Add event listeners for checkboxes to enable/disable amount inputs
        $$('#openListings .item-checkbox').forEach(checkbox => {
          const itemId = checkbox.value;
          const amountInput = checkbox.closest('form').querySelector(`input[name="amount_${itemId}"]`);
          
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
              amountInput.disabled = false;
              amountInput.required = true;
            } else {
              amountInput.disabled = true;
              amountInput.required = false;
              amountInput.value = '';
            }
          });
        });

        $$('#openListings [data-bid]').forEach(form => {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = form.getAttribute('data-bid');
            
            // Collect selected items and amounts
            const items = [];
            const checkboxes = form.querySelectorAll('input[type="checkbox"]:checked');
            
            checkboxes.forEach(cb => {
              const itemId = cb.value;
              const amountInput = form.querySelector(`input[name="amount_${itemId}"]`);
              if (amountInput && amountInput.value) {
                items.push({
                  eventListingItemId: itemId,
                  amount: parseFloat(amountInput.value)
                });
              }
            });

            if (items.length === 0) {
              alert('Lütfen en az bir kalem seçip teklif tutarı giriniz.');
              return;
            }

            const payload = {
              eventListingId: id,
              items: items,
              message: form.message.value
            };
            try{
              await api('/api/bids', { method:'POST', body: JSON.stringify(payload) });
              alert('Teklif gönderildi.');
              form.reset();
              await loadMyBids();
            }catch(err){ 
              console.error('Bid error:', err);
              alert('Hata: ' + (err.message || 'Teklif gönderilemedi.'));
            }
          });
        });

        if (vendorDashboardFocusListingId) {
          const focusCard = document.querySelector(`.vendor-listing-card[data-listing-id="${vendorDashboardFocusListingId}"]`);
          if (focusCard) {
            focusCard.classList.add('listing-focus-highlight');
            focusCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => focusCard.classList.remove('listing-focus-highlight'), 4000);
          }
          vendorDashboardFocusListingId = null;
          clearVendorDashboardQueryParams();
        }
        };
      } else {
        loadOpen = null;
      }

      loadMyBids = async function(){
        const myBidsEl = $('#myBids');
        if (!myBidsEl) return;
        const bids = await api('/api/bids/mine');
        myBidsEl.innerHTML = bids.map(bidCard).join('');
        bindBidCallPopups(myBidsEl);
      };

      if (typeof loadOpen === 'function') {
        await loadOpen();
      }
      await loadMyBids();
    }

    // My Listings Management Page
    if ($('#listingsTableBody')) {
      if (!(await ensureAuth('User'))) return;

      // Visibility status labels
      const visibilityLabels = VISIBILITY_META;

      async function loadMyListings() {
        try {
          const listings = await api('/api/listings/mine');
          const tbody = $('#listingsTableBody');
          
          if (listings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Henüz hiç ilanınız bulunmuyor.</td></tr>';
            return;
          }

          tbody.innerHTML = listings.map(listing => {
            const status = visibilityLabels[listing.visibility] || visibilityLabels[1];
            const eventDate = new Date(listing.eventDate).toLocaleDateString('tr-TR');
            
            // Determine which action buttons to show
            const isActive = listing.visibility === 1;
            const isPassive = listing.visibility === 0;
            const isDeleted = listing.visibility === 2;

            return `
              <tr>
                <td><strong>${listing.title}</strong></td>
                <td>${eventDate}</td>
                <td>${listing.location || '-'}</td>
                <td><span class="listing-status ${status.class}">${status.text}</span></td>
                <td>
                  <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="window.location.href='/Listings/Detail?id=${listing.id}'">Görüntüle</button>
                    <!-- Güncellendi: Artık detay sayfasını açıyor -->
                    ${isActive ? `<button class="action-btn btn-hide" data-action="hide" data-id="${listing.id}">Gizle</button>` : ''}
                    ${isPassive ? `<button class="action-btn btn-show" data-action="show" data-id="${listing.id}">Göster</button>` : ''}
                    ${!isDeleted ? `<button class="action-btn btn-delete" data-action="delete" data-id="${listing.id}">Sil</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('');

          // Attach event listeners
          attachActionListeners();
        } catch (err) {
          console.error('Failed to load listings:', err);
          $('#listingsTableBody').innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc3545;">İlanlar yüklenirken bir hata oluştu.</td></tr>';
        }
      }

      function attachActionListeners() {
        $$('[data-action="hide"]').forEach(btn => {
          btn.addEventListener('click', () => updateVisibility(btn.dataset.id, 0, 'gizlendi'));
        });

        $$('[data-action="show"]').forEach(btn => {
          btn.addEventListener('click', () => updateVisibility(btn.dataset.id, 1, 'yayına alındı'));
        });

        $$('[data-action="delete"]').forEach(btn => {
          btn.addEventListener('click', () => {
            if (confirm('Bu ilanı silmek istediğinizden emin misiniz? (Veriler korunacaktır)')) {
              updateVisibility(btn.dataset.id, 2, 'silindi');
            }
          });
        });
      }

      async function updateVisibility(listingId, visibility, actionText) {
        try {
          await api(`/api/listings/${listingId}/visibility`, {
            method: 'PATCH',
            body: JSON.stringify({ visibility })
          });
          
          showMessage(`İlan başarıyla ${actionText}.`, 'success');
          await loadMyListings();
        } catch (err) {
          console.error('Failed to update visibility:', err);
          showMessage('İşlem sırasında bir hata oluştu. Lütfen tekrar deneyin.', 'error');
        }
      }

      function showMessage(text, type) {
        const msg = $('#myListingsStatus');
        msg.textContent = text;
        msg.className = `info-message ${type}`;
        msg.style.display = 'block';
        setTimeout(() => {
          msg.style.display = 'none';
        }, 3000);
      }

      // Expose loadMyListings to global scope for the page script
      window.loadMyListings = loadMyListings;

      await loadMyListings();
    }

    // Admin - Listings oversight
    if ($('#adminListingsTableBody')) {
      if (!(await ensureAuth('Admin'))) return;

      const listingsFilter = $('#adminListingFilter');
      const listingsSearchForm = $('#adminListingSearchForm');
      const listingsSearchInput = $('#adminListingSearch');
      const listingsRefreshBtn = $('#adminListingsRefresh');
      const listingsStatus = $('#adminListingsStatus');

      function buildAdminListingRow(listing) {
        const visibilityMeta = VISIBILITY_META[listing.visibility] || VISIBILITY_META[1];
        const createdAt = new Date(listing.createdAtUtc).toLocaleDateString('tr-TR');
        const eventDate = new Date(listing.eventDate).toLocaleDateString('tr-TR');
        return `
          <tr>
            <td>
              <div class="admin-listing-title">${listing.title}</div>
              <small class="muted">${listing.items.length} kalem • ${fmt.format(listing.totalBudget)} ₺</small>
            </td>
            <td>${listing.createdBy}</td>
            <td>${eventDate}</td>
            <td>${createdAt}</td>
            <td><span class="listing-status ${visibilityMeta.class}">${visibilityMeta.text}</span></td>
            <td>
              <div class="action-buttons">
                <button class="action-btn btn-view" data-admin-view="${listing.id}">Görüntüle</button>
                <button class="action-btn btn-delete" data-admin-delete="${listing.id}">Sil</button>
              </div>
            </td>
          </tr>
        `;
      }

      function bindAdminListingActions() {
        $$('[data-admin-view]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-admin-view');
            window.location.href = `/Listings/Detail?id=${id}`;
          });
        });
        $$('[data-admin-delete]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-admin-delete');
            if (!confirm('Bu ilan kalıcı olarak silinecek. Onaylıyor musunuz?')) return;
            try {
              await api(`/api/admin/listings/${id}`, { method: 'DELETE' });
              if (listingsStatus) {
                listingsStatus.textContent = 'İlan silindi.';
                listingsStatus.className = 'info-message success';
                listingsStatus.style.display = 'block';
              }
              await loadAdminListings();
            } catch (err) {
              alert(err.message || 'İlan silinemedi.');
            }
          });
        });
      }

      async function loadAdminListings() {
        const tbody = $('#adminListingsTableBody');
        if (!tbody) return;
        if (listingsStatus) listingsStatus.style.display = 'none';
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#777;">Yükleniyor...</td></tr>';
        try {
          const params = new URLSearchParams();
          if (listingsFilter && listingsFilter.value) params.set('visibility', listingsFilter.value);
          if (listingsSearchInput && listingsSearchInput.value.trim()) params.set('q', listingsSearchInput.value.trim());
          const qs = params.toString();
          const listings = await api('/api/admin/listings' + (qs ? `?${qs}` : ''));
          if (!listings.length) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999;">İlan bulunamadı.</td></tr>';
            return;
          }
          tbody.innerHTML = listings.map(buildAdminListingRow).join('');
          bindAdminListingActions();
        } catch (err) {
          console.error('Admin listings load error:', err);
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#dc3545;">İlanlar yüklenirken hata oluştu.</td></tr>';
          if (listingsStatus) {
            listingsStatus.textContent = err.message || 'İlanlar yüklenemedi.';
            listingsStatus.className = 'info-message error';
            listingsStatus.style.display = 'block';
          }
        }
      }

      if (listingsFilter) listingsFilter.addEventListener('change', loadAdminListings);
      if (listingsSearchForm) {
        listingsSearchForm.addEventListener('submit', (e) => {
          e.preventDefault();
          loadAdminListings();
        });
      }
      if (listingsRefreshBtn) listingsRefreshBtn.addEventListener('click', loadAdminListings);

      await loadAdminListings();
    }

    // Admin - Vendor oversight
    if ($('#adminVendorsList')) {
      if (!(await ensureAuth('Admin'))) return;

      const vendorFilter = $('#adminVendorFilter');
      const vendorSearchForm = $('#adminVendorSearchForm');
      const vendorSearchInput = $('#adminVendorSearch');
      const vendorRefreshBtn = $('#adminVendorsRefresh');

      function buildVendorCard(v) {
        const statusClass = v.isVerified ? 'badge-success' : 'badge-warning';
        const statusText = v.isVerified ? 'Doğrulandı' : 'Onay Bekliyor';
        const categories = (v.serviceCategoriesCsv || '').split(',').map(c => c.trim()).filter(Boolean);
        const categoryBadges = categories.length
          ? categories.slice(0, 4).map(cat => `<span class="badge">${cat}</span>`).join('')
          : '<span class="badge muted">Kategori yok</span>';
        const contactRows = [
          `<div><strong>Email:</strong> ${v.email}</div>`
        ];
        if (v.phoneNumber) contactRows.push(`<div><strong>Telefon:</strong> ${v.phoneNumber}</div>`);
        if (v.priceRange) contactRows.push(`<div><strong>Fiyat:</strong> ${v.priceRange}</div>`);
        if (v.addressLabel) contactRows.push(`<div><strong>Adres:</strong> ${v.addressLabel}</div>`);

        return `
          <div class="admin-vendor-card">
            <div class="row between center">
              <div>
                <h4>${v.companyName}</h4>
                <small class="muted">${v.displayName || '-'}</small>
              </div>
              <span class="badge ${statusClass}">${statusText}</span>
            </div>
            <div class="admin-vendor-info">
              ${contactRows.join('')}
              ${v.venueType ? `<div><strong>Mekan Tipi:</strong> ${v.venueType}</div>` : ''}
              ${v.capacity ? `<div><strong>Kapasite:</strong> ${v.capacity}</div>` : ''}
            </div>
            <div class="admin-vendor-cats">${categoryBadges}</div>
            <div class="action-buttons">
              <button class="action-btn btn-delete" data-admin-vendor-delete="${v.userId}">Sil</button>
            </div>
          </div>
        `;
      }

      function bindVendorActions() {
        $$('[data-admin-vendor-delete]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-admin-vendor-delete');
            if (!confirm('Bu mekan profili ve hesabı kalıcı olarak silinecek. Devam edilsin mi?')) return;
            try {
              await api(`/api/admin/vendors/${id}`, { method: 'DELETE' });
              await loadAdminVendors();
            } catch (err) {
              alert(err.message || 'Mekan silinemedi.');
            }
          });
        });
      }

      async function loadAdminVendors() {
        const container = $('#adminVendorsList');
        if (!container) return;
        container.innerHTML = '<div class="muted">Yükleniyor...</div>';
        try {
          const params = new URLSearchParams();
          if (vendorFilter && vendorFilter.value && vendorFilter.value !== 'all') {
            params.set('verified', vendorFilter.value === 'verified' ? 'true' : 'false');
          }
          if (vendorSearchInput && vendorSearchInput.value.trim()) {
            params.set('q', vendorSearchInput.value.trim());
          }
          const qs = params.toString();
          const vendors = await api('/api/admin/vendors' + (qs ? `?${qs}` : ''));
          if (!vendors.length) {
            container.innerHTML = '<div class="muted">Kayıt bulunamadı.</div>';
            return;
          }
          container.innerHTML = vendors.map(buildVendorCard).join('');
          bindVendorActions();
        } catch (err) {
          console.error('Admin vendors load error:', err);
          container.innerHTML = `<div class="error-text">${err.message || 'Mekanlar yüklenemedi.'}</div>`;
        }
      }

      if (vendorFilter) vendorFilter.addEventListener('change', loadAdminVendors);
      if (vendorSearchForm) {
        vendorSearchForm.addEventListener('submit', (e) => {
          e.preventDefault();
          loadAdminVendors();
        });
      }
      if (vendorRefreshBtn) vendorRefreshBtn.addEventListener('click', loadAdminVendors);

      await loadAdminVendors();
    }

    // Vendor Dashboard
    let vendorProfileMap = null;
    let vendorMarker = null;
    let vendorTabsBound = false;

    function bindVendorTabs() {
      if (vendorTabsBound) return;
      const tabButtons = $$('.tab-btn');
      if (!tabButtons.length) return;
      vendorTabsBound = true;

      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const tabName = btn.dataset.tab;

          // Update buttons
          $$('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          // Update content
          $$('.tab-content').forEach(c => c.classList.remove('active'));
          const targetTab = $(`#${tabName}Tab`);
          if (targetTab) targetTab.classList.add('active');

          // Load data for the tab
          if (tabName === 'bids') {
            if (typeof loadMyBids === 'function') {
              loadMyBids();
            }
          } else if (tabName === 'profile') {
            setTimeout(() => {
              if (!vendorProfileMap) {
                initProfileMap();
              } else {
                vendorProfileMap.invalidateSize();
              }
            }, 100);
          }
        });
      });
    }

    initVendorDashboardImpl = async function() {
      // Sadece vendorProfileForm varsa çalıştır (Vendor Dashboard sayfası)
      const form = $('#vendorProfileForm');
      if (!form) {
        console.warn('vendorProfileForm bulunamadı; initVendorDashboard çalıştırılamadı.');
        return;
      }

      if (!(await ensureAuth('Vendor'))) return;

      bindVendorTabs();

      if (vendorDashboardInitialTab && vendorDashboardInitialTab !== 'profile') {
        const initialTab = vendorDashboardInitialTab === 'listings' ? 'reviews' : vendorDashboardInitialTab;
        setTimeout(() => {
          const targetBtn = document.querySelector(`.tab-btn[data-tab="${initialTab}"]`);
          if (targetBtn && !targetBtn.classList.contains('active')) {
            targetBtn.click();
          }
          if (vendorDashboardFocusListingId && initialTab !== 'listings') {
            vendorDashboardFocusListingId = null;
          }
          if (!vendorDashboardFocusListingId) {
            clearVendorDashboardQueryParams();
          }
        }, 0);
      }

      try {
        console.log('Vendor Dashboard başlatılıyor...');
        renderVendorSuitableForOptions();
        await loadVendorCategories();
        console.log('Kategoriler yüklendi');
        await loadVendorProfile();
        console.log('Profil yüklendi');
        setupFormHandlers();
        console.log('Form handler\'ları ayarlandı');
        // Harita loadVendorProfile içinde başlatılacak
      } catch (err) {
        console.error('Vendor Dashboard başlatma hatası:', err);
      }
    };

    const resolveVendorDashboardWaiters = () => {
      while (vendorDashboardInitWaiters.length) {
        const resolve = vendorDashboardInitWaiters.shift();
        try {
          if (typeof resolve === 'function') resolve();
        } catch (err) {
          console.error('Vendor dashboard init bekleyenleri çözerken hata:', err);
        }
      }
    };

    const runVendorDashboardInit = async () => {
      try {
        await initVendorDashboardImpl();
      } finally {
        resolveVendorDashboardWaiters();
      }
    };

    window.initVendorDashboard = initVendorDashboardImpl;

    if (window.__vendorDashboardInitRequested) {
      window.__vendorDashboardInitRequested = false;
    }

    if ($('#vendorProfileForm')) {
      runVendorDashboardInit();
    } else {
      resolveVendorDashboardWaiters();
    }

      function initProfileMap(lat, lng) {
        console.log('initProfileMap çağrıldı - lat:', lat, 'lng:', lng);
        const mapEl = $('#vendorProfileMap');
        if (!mapEl) {
          console.error('vendorProfileMap elementi bulunamadı');
          return;
        }
        console.log('Map elementi bulundu:', mapEl);
        
        if (typeof L === 'undefined') {
          console.error('Leaflet kütüphanesi yüklenmemiş, 500ms sonra tekrar denenecek');
          setTimeout(() => initProfileMap(lat, lng), 500);
          return;
        }
        console.log('Leaflet kütüphanesi yüklü');
        
        if (vendorProfileMap) {
          console.log('Mevcut harita temizleniyor');
          vendorProfileMap.remove();
          vendorProfileMap = null;
          if (vendorMarker) {
            vendorMarker = null;
          }
        }
        
        try {
          console.log('Harita oluşturuluyor...');
          // Eğer kullanıcının konumu varsa oraya odaklan, yoksa Türkiye geneline
          const center = (lat && lng) ? [lat, lng] : [39.9334, 32.8597];
          const zoom = (lat && lng) ? 13 : 6;
          vendorProfileMap = initLeafletMap('vendorProfileMap', center, zoom);
          console.log('Harita oluşturuldu:', vendorProfileMap);
          
          // Kullanıcının konumunu işaretle
          if (lat && lng) {
            vendorMarker = L.marker([lat, lng]).addTo(vendorProfileMap);
            const locationInfo = $('#locationInfo');
            if (locationInfo) {
              locationInfo.textContent = `Konum: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            }
          }
          
          setTimeout(() => {
            if (vendorProfileMap) {
              console.log('Harita boyutu yenileniyor');
              vendorProfileMap.invalidateSize();
            }
          }, 500);
          
          console.log('Harita başlatma tamamlandı');
        } catch (err) {
          console.error('Harita başlatma hatası:', err);
        }
      }

      async function loadVendorCategories() {
        try {
          const categories = await api('/api/categories');
          const container = $('#servicesContainer');
          if (!container) return;
          
          container.innerHTML = categories.map(cat => `
            <label class="service-item">
              <input type="checkbox" name="service_${cat.id}" value="${cat.name}" class="service-checkbox" />
              <span>${cat.name}</span>
            </label>
          `).join('');
          
          // Update hidden input when checkboxes change
          $$('.service-checkbox').forEach(cb => {
            cb.addEventListener('change', updateServicesInput);
          });
        } catch (err) {
          console.error('Kategoriler yüklenemedi:', err);
          const container = $('#servicesContainer');
          if (container) {
            container.innerHTML = '<div class="muted">Kategoriler yüklenemedi.</div>';
          }
        }
      }

      function updateServicesInput() {
        const checkboxes = $$('.service-checkbox:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);
        $('input[name="serviceCategoriesCsv"]').value = selected.join(',');
        
        // Seçili hizmetleri göster
        const selectedServicesDisplay = $('#selectedServicesDisplay');
        if (selectedServicesDisplay) {
          selectedServicesDisplay.innerHTML = '';
          
          if (selected.length > 0) {
            selected.forEach(serviceName => {
              const badge = document.createElement('span');
              badge.style.cssText = 'background: #374151; color: #f59e0b; padding: 6px 12px; border-radius: 6px; font-size: 0.9rem; display: inline-block;';
              badge.textContent = serviceName;
              selectedServicesDisplay.appendChild(badge);
            });
          } else {
            selectedServicesDisplay.innerHTML = '<div class="muted">Henüz hizmet seçilmemiş</div>';
          }
        }

        serviceToggleCollapsedLabel = selected.length ? 'Hizmetleri Güncelle' : '+ Hizmet Ekle';
        const toggleBtn = $('#toggleServicesBtn');
        const servicesContainer = $('#servicesContainer');
        if (toggleBtn && servicesContainer && (servicesContainer.style.display === 'none' || servicesContainer.style.display === '')) {
          toggleBtn.textContent = serviceToggleCollapsedLabel;
        }
      }

      function updateAmenitiesInput() {
        const checkboxes = $$('input[name="amenity"]:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);
        $('input[name="amenities"]').value = selected.join(',');
      }

      function updateSuitableForInput() {
        const form = $('#vendorProfileForm');
        if (!form || !form.suitableForCsv) return;
        const checkboxes = $$('input[name="suitableFor"]:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);
        form.suitableForCsv.value = selected.join(',');

        const allToggle = $('#suitableForAll');
        if (allToggle) {
          allToggle.checked = EVENT_PURPOSE_OPTIONS.length > 0 && EVENT_PURPOSE_OPTIONS.every(v => selected.includes(v));
        }
      }

      function renderVendorSuitableForOptions() {
        const grid = $('#suitableForGrid');
        if (!grid) return;
        if (grid.dataset.suitableForInit === '1') return;

        // Keep the existing "Hepsi" item, inject the rest
        EVENT_PURPOSE_OPTIONS.forEach(p => {
          const label = document.createElement('label');
          label.className = 'amenity-item';
          label.dataset.suitableFor = '1';

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.name = 'suitableFor';
          input.value = p;

          const span = document.createElement('span');
          span.textContent = p;

          label.appendChild(input);
          label.appendChild(span);
          grid.appendChild(label);
        });

        grid.dataset.suitableForInit = '1';
      }

      function parsePhotoUrls(raw) {
        if (!raw) return [];
        const trimmed = raw.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return parsed.map(item => (item ?? '').toString().trim()).filter(Boolean);
            }
          } catch { /* JSON parse ignored */ }
        }
        return trimmed.split(',').map(s => s.trim()).filter(Boolean);
      }

      function getPhotoUrlList() {
        const form = $('#vendorProfileForm');
        if (!form || !form.photoUrls) return [];
        return parsePhotoUrls(form.photoUrls.value || '');
      }

      function setPhotoUrls(urls) {
        const form = $('#vendorProfileForm');
        if (!form || !form.photoUrls) return;
        form.photoUrls.value = urls.join(', ');
        renderPhotoPreview(urls);
      }

      function renderPhotoPreview(urls) {
        const grid = $('#photoPreviewGrid');
        if (!grid) return;
        grid.innerHTML = '';
        if (!urls.length) {
          grid.innerHTML = '<div class="muted">Henüz fotoğraf eklenmedi.</div>';
          return;
        }
        urls.forEach((url, index) => {
          const card = document.createElement('div');
          card.className = 'photo-preview-card';
          card.innerHTML = `
            <img src="${url}" alt="Mekan fotoğrafı ${index + 1}" loading="lazy" />
            <button type="button" class="remove-photo-btn" data-photo-index="${index}" aria-label="Fotoğrafı kaldır">✕</button>
          `;
          grid.appendChild(card);
        });
      }

      function showPhotoUploadStatus(text, type = 'info') {
        const statusEl = $('#photoUploadStatus');
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.dataset.state = type;
        statusEl.style.visibility = text ? 'visible' : 'hidden';
      }

      async function loadVendorProfile() {
        try {
          console.log('=== loadVendorProfile başladı ===');
          showProfileStatus('Profil yükleniyor...', 'info');
          const selectedServicesDisplayInitial = $('#selectedServicesDisplay');
          if (selectedServicesDisplayInitial) {
            selectedServicesDisplayInitial.innerHTML = '<div class="muted">Yükleniyor...</div>';
          }
          const profile = await api('/api/vendor/profile');
          console.log('API\'den gelen profil:', profile);
          console.log('serviceCategoriesCsv:', profile.serviceCategoriesCsv);
          
          // Fill form
          const form = $('#vendorProfileForm');
          if (!form) {
            console.error('vendorProfileForm bulunamadı');
            return;
          }
          
          form.companyName.value = profile.companyName || '';
          form.description.value = profile.description || '';
          form.venueType.value = profile.venueType || '';
          form.capacity.value = profile.capacity || '';
          form.priceRange.value = profile.priceRange || '';
          form.phoneNumber.value = profile.phoneNumber || '';
          form.website.value = profile.website || '';
          form.workingHours.value = profile.workingHours || '';
          form.photoUrls.value = profile.photoUrls || '';
          form.venueAddressLabel.value = profile.venueAddressLabel || '';
          if (form.serviceCategoriesCsv) {
            form.serviceCategoriesCsv.value = profile.serviceCategoriesCsv || '';
          }
          renderPhotoPreview(getPhotoUrlList());
          
          // Services - Seçili hizmetleri göster
          console.log('Services bölümü işleniyor...');
          const services = (profile.serviceCategoriesCsv || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
          const serviceCheckboxes = $$('.service-checkbox');
          if (services.length) {
            console.log('Servisleri işaretliyorum...', services);
            serviceCheckboxes.forEach(cb => {
              cb.checked = services.includes(cb.value);
            });
          } else {
            console.log('Servis listesi boş, tüm checkboxlar temizleniyor.');
            serviceCheckboxes.forEach(cb => { cb.checked = false; });
          }

          updateServicesInput();

          const toggleBtn = $('#toggleServicesBtn');
          const servicesContainer = $('#servicesContainer');
          const hasServices = services.length > 0;
          if (toggleBtn) {
            serviceToggleCollapsedLabel = hasServices ? 'Hizmetleri Güncelle' : '+ Hizmet Ekle';
            if (!servicesContainer || servicesContainer.style.display === 'none' || servicesContainer.style.display === '') {
              toggleBtn.textContent = serviceToggleCollapsedLabel;
            }
          }
          
          // Amenities
          if (profile.amenities) {
            const amenities = profile.amenities.split(',');
            amenities.forEach(amenity => {
              const checkbox = $$('input[name="amenity"]').find(cb => cb.value === amenity.trim());
              if (checkbox) checkbox.checked = true;
            });
            updateAmenitiesInput();
          }

          // SuitableFor (Hangi etkinlik için uygun?)
          if (form.suitableForCsv) {
            form.suitableForCsv.value = profile.suitableForCsv || '';
          }
          if (profile.suitableForCsv) {
            const selected = profile.suitableForCsv
              .split(',')
              .map(s => s.trim())
              .filter(Boolean);
            $$('input[name="suitableFor"]').forEach(cb => {
              cb.checked = selected.includes(cb.value);
            });
          } else {
            $$('input[name="suitableFor"]').forEach(cb => { cb.checked = false; });
          }
          updateSuitableForInput();
          
          // Social media
          if (profile.socialMediaLinks) {
            try {
              const social = JSON.parse(profile.socialMediaLinks);
              if (form.instagram && social.instagram) form.instagram.value = social.instagram;
              if (form.facebook && social.facebook) form.facebook.value = social.facebook;
              if (form.twitter && social.twitter) form.twitter.value = social.twitter;
            } catch (e) {
              // Ignore parse errors
            }
          }
          
          // Map - Haritayı kullanıcının kayıt konumuyla başlat
          setTimeout(() => {
            if (profile.venueLatitude && profile.venueLongitude) {
              initProfileMap(profile.venueLatitude, profile.venueLongitude);
            } else {
              initProfileMap(null, null);
            }
          }, 1000);
          
          hideProfileStatus();
        } catch (err) {
          console.error('Profil yükleme hatası:', err);
          // Profil yoksa boş form göster, hata mesajı gösterme
          const selectedServicesDisplay = $('#selectedServicesDisplay');
          if (selectedServicesDisplay) {
            selectedServicesDisplay.innerHTML = '<div class="muted">Henüz hizmet seçilmemiş</div>';
          }
          renderPhotoPreview([]);
          hideProfileStatus();
        }
      }

      function setupFormHandlers() {
        // Amenities checkboxes
        $$('input[name="amenity"]').forEach(cb => {
          cb.addEventListener('change', updateAmenitiesInput);
        });

        const suitableAll = $('#suitableForAll');
        if (suitableAll) {
          suitableAll.addEventListener('change', () => {
            const shouldCheck = suitableAll.checked;
            $$('input[name="suitableFor"]').forEach(cb => { cb.checked = shouldCheck; });
            updateSuitableForInput();
          });
        }

        $$('input[name="suitableFor"]').forEach(cb => {
          cb.addEventListener('change', updateSuitableForInput);
        });

        const addPhotoBtn = $('#addPhotoBtn');
        const photoFileInput = $('#photoFileInput');
        const photoPreviewGrid = $('#photoPreviewGrid');
        const form = $('#vendorProfileForm');
        const photoTextarea = form?.photoUrls;

        if (addPhotoBtn && photoFileInput) {
          addPhotoBtn.addEventListener('click', () => photoFileInput.click());
        }

        if (photoFileInput) {
          photoFileInput.addEventListener('change', (e) => {
            const fileList = Array.from(e.target.files || []);
            handlePhotoFileSelection(fileList);
          });
        }

        if (photoPreviewGrid) {
          photoPreviewGrid.addEventListener('click', (evt) => {
            const target = evt.target;
            if (!target || typeof target.closest !== 'function') return;
            const removeBtn = target.closest('[data-photo-index]');
            if (!removeBtn) return;
            const index = parseInt(removeBtn.dataset.photoIndex, 10);
            if (Number.isNaN(index)) return;
            const urls = getPhotoUrlList();
            urls.splice(index, 1);
            setPhotoUrls(urls);
          });
        }

        if (photoTextarea && photoTextarea.tagName === 'TEXTAREA') {
          photoTextarea.addEventListener('input', () => {
            renderPhotoPreview(getPhotoUrlList());
          });
        }

        const toggleBtn = $('#toggleServicesBtn');
        const servicesContainer = $('#servicesContainer');
        if (toggleBtn && servicesContainer) {
          toggleBtn.addEventListener('click', () => {
            const isHidden = servicesContainer.style.display === 'none' || servicesContainer.style.display === '';
            servicesContainer.style.display = isHidden ? 'grid' : 'none';
            toggleBtn.textContent = isHidden ? 'Hizmetleri Gizle' : serviceToggleCollapsedLabel;
            toggleBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
          });
        }
        
        // Save button
        const saveBtn = $('#saveProfileBtn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await saveVendorProfile();
          });
        }
      }

      async function saveVendorProfile() {
        try {
          const form = $('#vendorProfileForm');
          
          if (!form.companyName.value.trim()) {
            showProfileStatus('Firma/Mekan adı zorunludur.', 'error');
            return;
          }
          
          // Prepare social media links
          const socialMediaLinks = JSON.stringify({
            instagram: form.instagram?.value || '',
            facebook: form.facebook?.value || '',
            twitter: form.twitter?.value || ''
          });
          
          const payload = {
            companyName: form.companyName.value.trim(),
            description: form.description.value.trim() || null,
            venueType: form.venueType.value || null,
            capacity: form.capacity.value ? parseInt(form.capacity.value) : null,
            amenities: form.amenities.value || null,
            suitableForCsv: (form.suitableForCsv?.value || '').trim() || null,
            priceRange: form.priceRange.value.trim() || null,
            phoneNumber: form.phoneNumber.value.trim() || null,
            website: form.website.value.trim() || null,
            socialMediaLinks: socialMediaLinks,
            workingHours: form.workingHours.value.trim() || null,
            photoUrls: form.photoUrls.value.trim() || null,
            serviceCategoriesCsv: form.serviceCategoriesCsv.value || null,
            venueLatitude: null, // Konum kayıt sırasında belirlenir, burada güncellenmez
            venueLongitude: null,
            venueAddressLabel: form.venueAddressLabel.value.trim() || null
          };
          
          showProfileStatus('Profil kaydediliyor...', 'info');
          
          await api('/api/vendor/profile', {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          
          showProfileStatus('✓ Profil başarıyla kaydedildi!', 'success');
          
          setTimeout(() => {
            hideProfileStatus();
          }, 3000);
          
        } catch (err) {
          console.error('Profil kaydetme hatası:', err);
          showProfileStatus('Hata: ' + err.message, 'error');
        }
      }

      async function handlePhotoFileSelection(files) {
        if (!files || !files.length) return;
        const imageFiles = files.filter(file => file && file.type?.startsWith('image/'));
        if (!imageFiles.length) {
          showPhotoUploadStatus('Lütfen yalnızca görsel dosyaları seçin.', 'error');
          return;
        }

        const existing = getPhotoUrlList();
        const remainingSlots = MAX_VENDOR_PHOTOS - existing.length;
        if (remainingSlots <= 0) {
          showPhotoUploadStatus('En fazla 10 fotoğraf ekleyebilirsiniz.', 'error');
          return;
        }

        const oversized = imageFiles.find(file => file.size > 5 * 1024 * 1024);
        if (oversized) {
          showPhotoUploadStatus('Her fotoğraf 5MB sınırını aşmamalı.', 'error');
          return;
        }

        const filesToUpload = imageFiles.slice(0, remainingSlots);
        const formData = new FormData();
        filesToUpload.forEach(file => formData.append('photos', file));

        showPhotoUploadStatus('Fotoğraflar yükleniyor...', 'info');
        try {
          const result = await api('/api/vendor/photos', { method: 'POST', body: formData });
          const uploaded = result?.urls || [];
          if (!uploaded.length) {
            showPhotoUploadStatus('Fotoğraf yüklenemedi.', 'error');
            return;
          }
          const combined = existing.concat(uploaded).slice(0, MAX_VENDOR_PHOTOS);
          setPhotoUrls(combined);
          showPhotoUploadStatus('Fotoğraflar yüklendi.', 'success');
        } catch (err) {
          console.error('Fotoğraf yükleme hatası:', err);
          showPhotoUploadStatus(err.message || 'Fotoğraf yüklenemedi.', 'error');
        } finally {
          const input = $('#photoFileInput');
          if (input) input.value = '';
          setTimeout(() => showPhotoUploadStatus('', 'info'), 3000);
        }
      }

      function showProfileStatus(text, type) {
        const statusEl = $('#profileStatus');
        if (statusEl) {
          statusEl.textContent = text;
          statusEl.className = `status-message ${type}`;
          statusEl.style.display = 'block';
        }
      }

      function hideProfileStatus() {
        const statusEl = $('#profileStatus');
        if (statusEl) {
          statusEl.style.display = 'none';
        }
      }

      // Public Vendor Detail (Mekan) page
      const vendorPublicRoot = $('#vendorPublicRoot');
      if (vendorPublicRoot) {
        const vendorUserId = vendorPublicRoot.getAttribute('data-vendor-user-id');
        const titleEl = $('#vendorPublicTitle');
        const subtitleEl = $('#vendorPublicSubtitle');
        const cardEl = $('#vendorPublicCard');
        const headerRatingEl = $('#vendorPublicHeaderRating');
        const headerActionsEl = $('#vendorPublicHeaderActions');

        function setInlineStatus(el, text) {
          if (!el) return;
          el.textContent = text || '';
          el.style.display = text ? 'block' : 'none';
        }

        function renderReviews(list) {
          const root = $('#vendorReviewsList');
          if (!root) return;
          root.innerHTML = '';

          if (!Array.isArray(list) || list.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'muted';
            empty.textContent = 'Henüz yorum yok.';
            root.appendChild(empty);
            return;
          }

          list.forEach(r => {
            const item = document.createElement('div');
            item.className = 'vendor-public-item';

            const header = document.createElement('div');
            header.className = 'vendor-public-item-header';

            const who = document.createElement('div');
            who.className = 'vendor-public-item-who';
            who.textContent = r.userDisplayName || 'Kullanıcı';

            const when = document.createElement('div');
            when.className = 'muted vendor-public-item-when';
            const dt = r.updatedAtUtc || r.createdAtUtc;
            when.textContent = dt ? new Date(dt).toLocaleString('tr-TR') : '';

            header.appendChild(who);
            header.appendChild(when);

            const body = document.createElement('div');
            body.className = 'vendor-public-item-body';
            body.textContent = r.comment || '';

            item.appendChild(header);
            item.appendChild(body);
            root.appendChild(item);
          });
        }

        function renderQuestions(list) {
          const root = $('#vendorQuestionsList');
          if (!root) return;
          root.innerHTML = '';

          if (!Array.isArray(list) || list.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'muted';
            empty.textContent = 'Henüz soru yok.';
            root.appendChild(empty);
            return;
          }

          list.forEach(q => {
            const item = document.createElement('div');
            item.className = 'vendor-public-item';

            const header = document.createElement('div');
            header.className = 'vendor-public-item-header';

            const who = document.createElement('div');
            who.className = 'vendor-public-item-who';
            who.textContent = q.userDisplayName || 'Kullanıcı';

            const when = document.createElement('div');
            when.className = 'muted vendor-public-item-when';
            when.textContent = q.createdAtUtc ? new Date(q.createdAtUtc).toLocaleString('tr-TR') : '';

            header.appendChild(who);
            header.appendChild(when);

            const question = document.createElement('div');
            question.className = 'vendor-public-item-body';
            question.textContent = q.question || '';

            const answerWrap = document.createElement('div');
            answerWrap.className = 'vendor-public-answer';
            if (q.answer) {
              answerWrap.textContent = `Yanıt: ${q.answer}`;
            } else {
              answerWrap.className = 'muted vendor-public-answer';
              answerWrap.textContent = 'Yanıt bekleniyor.';
            }

            item.appendChild(header);
            item.appendChild(question);
            item.appendChild(answerWrap);
            root.appendChild(item);
          });
        }

        async function loadReviews() {
          setInlineStatus($('#vendorReviewsStatus'), 'Yorumlar yükleniyor...');
          try {
            const list = await api(`/api/vendors/${vendorUserId}/reviews`);
            renderReviews(list);
            setInlineStatus($('#vendorReviewsStatus'), '');
          } catch (err) {
            console.error('Reviews load error:', err);
            setInlineStatus($('#vendorReviewsStatus'), err.message || 'Yorumlar yüklenemedi.');
          }
        }

        async function loadQuestions() {
          setInlineStatus($('#vendorQuestionsStatus'), 'Sorular yükleniyor...');
          try {
            const list = await api(`/api/vendors/${vendorUserId}/questions`);
            renderQuestions(list);
            setInlineStatus($('#vendorQuestionsStatus'), '');
          } catch (err) {
            console.error('Questions load error:', err);
            setInlineStatus($('#vendorQuestionsStatus'), err.message || 'Sorular yüklenemedi.');
          }
        }

        try {
          if (!vendorUserId) throw new Error('Mekan kimliği bulunamadı.');
          const v = await api(`/api/vendors/${vendorUserId}`);

          if (titleEl) titleEl.textContent = v.companyName || 'Mekan';
          if (subtitleEl) {
            const addr = v.addressLabel ? ` • ${v.addressLabel}` : '';
            subtitleEl.textContent = (v.isVerified ? 'Onaylı Mekan' : 'Mekan') + addr;
          }

          const avg = (typeof v.averageRating === 'number' && !Number.isNaN(v.averageRating)) ? v.averageRating : null;
          const count = (typeof v.ratingCount === 'number' && Number.isFinite(v.ratingCount)) ? v.ratingCount : 0;
          const percent = avg ? Math.max(0, Math.min(100, (avg / 5) * 100)) : 0;
          const perfectClass = (avg && avg >= 4.999) ? 'is-perfect' : '';

          // Header actions (Soru Sor / Ara)
          if (headerActionsEl) {
            headerActionsEl.innerHTML = '';

            const askBtn = document.createElement('button');
            askBtn.type = 'button';
            askBtn.className = 'btn small danger';
            askBtn.textContent = 'Soru Sor';
            askBtn.addEventListener('click', (e) => {
              e.preventDefault();
              const target = document.getElementById('vendorQuestionsSection') || document.getElementById('vendorQuestionComposer');
              if (target && typeof target.scrollIntoView === 'function') {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            });
            headerActionsEl.appendChild(askBtn);

            const phone = v.phoneNumber ? String(v.phoneNumber).trim() : '';
            if (phone) {
              const callBtn = document.createElement('button');
              callBtn.type = 'button';
              callBtn.className = 'btn small danger';
              callBtn.textContent = 'Ara';

              const tel = phone.replace(/\s+/g, '');

              const popup = document.createElement('div');
              popup.className = 'vendor-public-phone-pop';
              popup.style.display = 'none';
              popup.innerHTML = `
                <div class="vendor-public-phone-pop-inner">
                  <div class="vendor-public-phone-row">
                    <div class="vendor-public-phone-number">${phone}</div>
                    <a class="btn small danger" href="tel:${tel}">Ara</a>
                  </div>
                </div>
              `;

              function closePopup() {
                popup.style.display = 'none';
              }

              function togglePopup() {
                popup.style.display = (popup.style.display === 'none') ? 'block' : 'none';
              }

              callBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePopup();
              });

              // Close on outside click
              document.addEventListener('click', (e) => {
                if (popup.style.display === 'none') return;
                const t = e.target;
                if (t === callBtn || popup.contains(t)) return;
                closePopup();
              });

              headerActionsEl.appendChild(callBtn);
              headerActionsEl.appendChild(popup);
            }
          }

          if (headerRatingEl) {
            headerRatingEl.innerHTML = '';
            if (avg) {
              const stars = document.createElement('span');
              stars.className = `rating-stars ${perfectClass}`;
              stars.style.setProperty('--percent', `${percent}%`);
              stars.setAttribute('aria-label', `${avg.toFixed(1)} / 5`);

              const text = document.createElement('span');
              text.className = 'muted vendor-rating-text';
              text.textContent = `${avg.toFixed(1)} (${count})`;

              headerRatingEl.appendChild(stars);
              headerRatingEl.appendChild(text);
              headerRatingEl.style.display = 'flex';
            } else {
              headerRatingEl.style.display = 'none';
            }
          }

          const categories = Array.isArray(v.serviceCategories) ? v.serviceCategories : [];
          const photoUrls = (typeof v.photoUrls === 'string' ? v.photoUrls : '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

          const catsHtml = categories.length
            ? categories.map(c => `<span class="badge" style="margin-right:6px;margin-bottom:6px">${c}</span>`).join('')
            : '<span class="muted">Kategori belirtilmemiş.</span>';

          const photosHtml = photoUrls.length
            ? (() => {
                const hero = photoUrls[0];
                const hasNav = photoUrls.length > 1;
                const thumbs = photoUrls.slice(0, 9);
                const thumbsHtml = thumbs.length > 1
                  ? `<div class="vendor-public-thumbs">
                      ${thumbs.map((url, idx) => `
                        <button type="button" class="vendor-public-thumb" data-thumb-index="${idx}" aria-label="Fotoğraf ${idx + 1}">
                          <img src="${url}" alt="Mekan fotoğrafı" loading="lazy" />
                        </button>
                      `).join('')}
                    </div>`
                  : '';
                return `
                  <div class="vendor-public-gallery" data-photo-count="${photoUrls.length}">
                    <div class="vendor-public-hero-wrap">
                      <a href="${hero}" target="_blank" rel="noopener" class="vendor-public-hero-link" aria-label="Fotoğrafı büyüt">
                        <img id="vendorPublicHeroImg" src="${hero}" alt="Mekan fotoğrafı" />
                      </a>
                      ${hasNav ? `
                        <button type="button" class="vendor-public-hero-btn is-prev" data-hero-prev aria-label="Önceki fotoğraf">‹</button>
                        <button type="button" class="vendor-public-hero-btn is-next" data-hero-next aria-label="Sonraki fotoğraf">›</button>
                      ` : ''}
                    </div>
                    ${thumbsHtml}
                  </div>
                `;
              })()
            : '';

          const webHtml = v.website
            ? `<div style="margin-top:10px;"><a class="btn small" href="${v.website}" target="_blank" rel="noopener">Web Sitesi</a></div>`
            : '';

          if (cardEl) {
            cardEl.innerHTML = `
              ${photosHtml}

              ${v.description ? `<p class="muted" style="margin-top:12px;">${v.description}</p>` : '<p class="muted" style="margin-top:12px;">Açıklama eklenmemiş.</p>'}

              <div style="margin-top:12px;">${catsHtml}</div>

              <div class="row gap wrap" style="margin-top:12px;">
                ${v.venueType ? `<span class="badge">${v.venueType}</span>` : ''}
                ${v.capacity ? `<span class="badge">${v.capacity} Kişi</span>` : ''}
                ${v.priceRange ? `<span class="badge">${v.priceRange}</span>` : ''}
                ${v.isVerified ? `<span class="badge" style="background:var(--ok); color:#fff;">Onaylı Mekan</span>` : ''}
              </div>

              ${webHtml}

              <div class="vendor-public-location">
                <h3 style="margin:14px 0 10px 0;">Konum</h3>
                <div id="vendorPublicMap" class="vendor-public-map" aria-label="Mekan harita konumu"></div>
                <div id="vendorPublicAddress" class="muted" style="margin-top:8px;"></div>
              </div>

              <div class="vendor-public-social">
                <div class="vendor-rating-row" style="margin-top:0;">
                  <span class="rating-stars ${perfectClass}" style="--percent:${percent}%;" aria-label="${avg ? `${avg.toFixed(1)} / 5` : 'Değerlendirme yok'}"></span>
                  <span class="muted vendor-rating-text">${avg ? `${avg.toFixed(1)} (${count})` : '—'}</span>
                </div>

                <div class="vendor-public-columns">
                  <div class="card" style="margin-bottom:0;">
                    <div class="row between center" style="gap:12px; flex-wrap:wrap; margin-bottom:10px;">
                      <h3 style="margin:0;">Yorumlar</h3>
                      <div id="vendorReviewsStatus" class="muted" style="display:none;"></div>
                    </div>

                    <div id="vendorReviewComposer" style="margin-bottom:12px;"></div>
                    <div id="vendorReviewsList"></div>
                  </div>

                  <div class="card" id="vendorQuestionsSection" style="margin-bottom:0;">
                    <div class="row between center" style="gap:12px; flex-wrap:wrap; margin-bottom:10px;">
                      <h3 style="margin:0;">Soru Sor</h3>
                      <div id="vendorQuestionsStatus" class="muted" style="display:none;"></div>
                    </div>

                    <div id="vendorQuestionComposer" style="margin-bottom:12px;"></div>
                    <div id="vendorQuestionsList"></div>
                  </div>
                </div>
              </div>
            `;

            // Gallery interactions (store-like)
            try {
              const gallery = $('.vendor-public-gallery', cardEl);
              if (gallery && photoUrls.length > 0) {
                let currentIndex = 0;
                const heroLink = $('.vendor-public-hero-link', gallery);
                const heroImg = $('#vendorPublicHeroImg', gallery);
                const prevBtn = $('[data-hero-prev]', gallery);
                const nextBtn = $('[data-hero-next]', gallery);
                const thumbButtons = $$('[data-thumb-index]', gallery);

                function setActiveThumb() {
                  thumbButtons.forEach(btn => {
                    const idx = Number(btn.getAttribute('data-thumb-index'));
                    if (Number.isFinite(idx) && idx === currentIndex) btn.classList.add('is-active');
                    else btn.classList.remove('is-active');
                  });
                }

                function setHero(idx) {
                  if (!heroImg || !heroLink) return;
                  const safeIdx = ((idx % photoUrls.length) + photoUrls.length) % photoUrls.length;
                  currentIndex = safeIdx;
                  const url = photoUrls[safeIdx];
                  heroImg.src = url;
                  heroLink.href = url;
                  setActiveThumb();
                }

                if (prevBtn) {
                  prevBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setHero(currentIndex - 1);
                  });
                }
                if (nextBtn) {
                  nextBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setHero(currentIndex + 1);
                  });
                }

                thumbButtons.forEach(btn => {
                  btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const idx = Number(btn.getAttribute('data-thumb-index'));
                    if (Number.isFinite(idx)) setHero(idx);
                  });
                });

                setHero(0);
              }
            } catch (err) {
              console.warn('Vendor gallery init failed:', err?.message || err);
            }

            // Map (Konum)
            try {
              const mapEl = $('#vendorPublicMap');
              const addrEl = $('#vendorPublicAddress');
              const lat = (typeof v.latitude === 'number' && Number.isFinite(v.latitude)) ? v.latitude : null;
              const lng = (typeof v.longitude === 'number' && Number.isFinite(v.longitude)) ? v.longitude : null;
              const addrText = v.addressLabel ? String(v.addressLabel) : '';

              if (addrEl) {
                addrEl.textContent = addrText || (lat && lng ? `Konum: ${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Konum bilgisi eklenmemiş.');
              }

              if (mapEl && lat && lng && window.L && typeof window.L.map === 'function') {
                mapEl.innerHTML = '';
                const map = window.L.map(mapEl, {
                  zoomControl: true,
                  scrollWheelZoom: false
                }).setView([lat, lng], 15);

                window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                  attribution: '&copy; OpenStreetMap'
                }).addTo(map);

                window.L.marker([lat, lng]).addTo(map);

                // Leaflet needs a size invalidate when inside dynamic layout
                setTimeout(() => {
                  try { map.invalidateSize(); } catch (_) { }
                }, 50);
              } else if (mapEl) {
                mapEl.innerHTML = '<div class="muted">Harita için konum bilgisi yok.</div>';
              }
            } catch (err) {
              console.warn('Vendor map init failed:', err?.message || err);
            }

            // Composer UI (User only)
            const reviewComposer = $('#vendorReviewComposer');
            const questionComposer = $('#vendorQuestionComposer');
            const isUserLoggedIn = !!token() && role() === 'User';
            const loginHintHtml = `<div class="muted">Bu işlemi yapmak için <a href="/Auth/Login">giriş yapın</a> (User).</div>`;

            if (reviewComposer) {
              reviewComposer.innerHTML = isUserLoggedIn
                ? `
                  <form id="vendorReviewForm">
                    <textarea id="vendorReviewText" class="input" rows="3" placeholder="Yorumunuzu yazın..."></textarea>
                    <div class="row between center" style="gap:12px; flex-wrap:wrap; margin-top:8px;">
                      <div id="vendorReviewSubmitStatus" class="muted" style="display:none;"></div>
                      <button type="submit" class="btn small primary">Yorum Gönder</button>
                    </div>
                  </form>
                `
                : loginHintHtml;
            }

            if (questionComposer) {
              questionComposer.innerHTML = isUserLoggedIn
                ? `
                  <form id="vendorQuestionForm">
                    <textarea id="vendorQuestionText" class="input" rows="3" placeholder="Sorunuzu yazın..."></textarea>
                    <div class="row between center" style="gap:12px; flex-wrap:wrap; margin-top:8px;">
                      <div id="vendorQuestionSubmitStatus" class="muted" style="display:none;"></div>
                      <button type="submit" class="btn small primary">Soruyu Gönder</button>
                    </div>
                  </form>
                `
                : loginHintHtml;
            }

            const reviewForm = $('#vendorReviewForm');
            if (reviewForm) {
              reviewForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const statusEl = $('#vendorReviewSubmitStatus');
                setInlineStatus(statusEl, 'Gönderiliyor...');
                try {
                  const textEl = $('#vendorReviewText');
                  const comment = textEl ? String(textEl.value || '').trim() : '';
                  await api(`/api/vendors/${vendorUserId}/reviews`, {
                    method: 'POST',
                    body: JSON.stringify({ comment })
                  });
                  if (textEl) textEl.value = '';
                  setInlineStatus(statusEl, 'Yorum kaydedildi.');
                  await loadReviews();
                  setTimeout(() => setInlineStatus(statusEl, ''), 2000);
                } catch (err) {
                  console.error('Review submit error:', err);
                  setInlineStatus(statusEl, err.message || 'Yorum gönderilemedi.');
                }
              });
            }

            const questionForm = $('#vendorQuestionForm');
            if (questionForm) {
              questionForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const statusEl = $('#vendorQuestionSubmitStatus');
                setInlineStatus(statusEl, 'Gönderiliyor...');
                try {
                  const textEl = $('#vendorQuestionText');
                  const question = textEl ? String(textEl.value || '').trim() : '';
                  await api(`/api/vendors/${vendorUserId}/questions`, {
                    method: 'POST',
                    body: JSON.stringify({ question })
                  });
                  if (textEl) textEl.value = '';
                  setInlineStatus(statusEl, 'Soru gönderildi.');
                  await loadQuestions();
                  setTimeout(() => setInlineStatus(statusEl, ''), 2000);
                } catch (err) {
                  console.error('Question submit error:', err);
                  setInlineStatus(statusEl, err.message || 'Soru gönderilemedi.');
                }
              });
            }

            await Promise.all([loadReviews(), loadQuestions()]);
          }
        } catch (err) {
          console.error('Vendor public page load error:', err);
          if (subtitleEl) subtitleEl.textContent = 'Detaylar yüklenemedi.';
          if (cardEl) cardEl.innerHTML = '<div class="muted">Mekan bilgileri yüklenemedi.</div>';
        }
      }

  });
})();
