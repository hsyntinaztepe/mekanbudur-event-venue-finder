(function () {
  const apiBase = document.querySelector('meta[name="api-base"]').content || 'http://localhost:8081';
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const fmt = new Intl.NumberFormat('tr-TR');

  function token() { return localStorage.getItem('token') || ''; }
  function role() { return localStorage.getItem('role') || ''; }
  function displayName() { return localStorage.getItem('displayName') || ''; }

  function setAuthUI() {
    const r = role();
    const isUser = r === 'User';
    const isVendor = r === 'Vendor';
    $$('.only-user').forEach(el => el.style.display = isUser ? 'inline-block' : 'none');
    $$('.only-vendor').forEach(el => el.style.display = isVendor ? 'inline-block' : 'none');
    const logout = $('#logoutBtn');
    if (logout) logout.style.display = token() ? 'inline-block' : 'none';
  }

  async function api(path, opts={}){
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    const res = await fetch(apiBase + path, Object.assign({}, opts, { headers }));
    if (!res.ok) {
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

  function listingCard(l){
    const d = new Date(l.eventDate);
    return `
      <div class="card listing-card">
        <div class="row between center">
          <span class="badge">${l.categoryName}</span>
          <span class="badge">${l.location || '-'}</span>
        </div>
        <h4>${l.title}</h4>
        <p class="muted">${l.description ? l.description.slice(0,120) : ''}</p>
        <div class="row between center">
          <small>${d.toLocaleDateString('tr-TR')}</small>
          <small class="price">${fmt.format(l.budget)} ₺</small>
        </div>
        <div class="row gap">
          <a class="btn small" href="/Listings/Detail?id=${l.id}">Detay</a>
          <a class="btn small" href="/Auth/Login">Teklif Ver</a>
        </div>
      </div>
    `;
  }

  function myListingCard(l){
    return `
      <div class="card listing-card">
        <div class="row between center">
          <span class="badge">${l.categoryName}</span>
          <span class="badge">${l.status}</span>
        </div>
        <h4>${l.title}</h4>
        <div class="row between center">
          <small>${new Date(l.eventDate).toLocaleDateString('tr-TR')}</small>
          <small class="price">${fmt.format(l.budget)} ₺</small>
        </div>
        <div class="row gap">
          <a class="btn small" href="/Listings/Detail?id=${l.id}">Detay</a>
          <button class="btn small" data-bids="${l.id}">Teklifleri Gör</button>
        </div>
      </div>
    `;
  }

  function bidCard(b){
    return `
      <div class="card">
        <div class="row between center">
          <strong>${b.vendorDisplayName || '-'}</strong>
          <span class="badge">${b.status}</span>
        </div>
        <p class="price">${fmt.format(b.amount)} ₺</p>
        <p class="muted">${b.message || ''}</p>
        ${b.status === 'Pending' ? `<button class="btn small" data-accept="${b.id}">Kabul Et</button>` : ''}
      </div>
    `;
  }

  async function loadCategories(selectEl){
    const cats = await api('/api/categories');
    selectEl.innerHTML = '<option value="">Kategori (hepsi)</option>' + cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  async function loadUserCategories(selectEl){
    const cats = await api('/api/categories');
    selectEl.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
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
    $('#listingGrid').innerHTML = list.length ? list.map(listingCard).join('') :
      '<div class="muted">Kriterlere uygun ilan bulunamadı.</div>';
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
      el.innerHTML = `
        <div class="row between center">
          <div>
            <h2>${l.title}</h2>
            <div class="muted">${l.categoryName} · ${new Date(l.eventDate).toLocaleDateString('tr-TR')} · ${l.location || '-'}</div>
          </div>
          <div class="price">${fmt.format(l.budget)} ₺</div>
        </div>
        <p>${l.description || ''}</p>
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
    } catch (err) {
      alert(err.message);
    }
  }

  // Vendor registration map
  window.initVendorMap = function(){
    const mapEl = $('#vendorMap');
    if (!mapEl) return;
    const map = initLeafletMap('vendorMap');
    let marker;
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
  }

  // Page wiring
  document.addEventListener('DOMContentLoaded', async () => {
    setAuthUI();

    // logout
    const logout = $('#logoutBtn');
    if (logout) logout.addEventListener('click', () => { localStorage.clear(); window.location.href = '/'; });

    // Index
    if ($('#listingGrid')) {
      await loadCategories($('#category'));
      $('#searchBtn').addEventListener('click', search);
      await search();
    }

    // Login
    if ($('#loginForm')) {
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
          window.location.href = res.role === 'Vendor' ? '/Vendor/Dashboard' : '/User/Dashboard';
        }catch(err){ 
          console.error('Registration error:', err);
          alert('Hata: ' + (err.message || 'Kayıt olunamadı. Lütfen tekrar deneyin.'));
        }
      });
    }

    // Register
    if ($('#registerForm')) {
      $('#registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        // Role değerini enum'a uygun hale getir
        const roleValue = form.role.value === 'Vendor' ? 'Vendor' : 'User';
        
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
        
        console.log('Register payload:', payload);
        try{
          const res = await api('/api/auth/register', { method:'POST', body: JSON.stringify(payload) });
          localStorage.setItem('token', res.token);
          localStorage.setItem('role', res.role);
          localStorage.setItem('displayName', res.displayName);
          window.location.href = res.role === 'Vendor' ? '/Vendor/Dashboard' : '/User/Dashboard';
        }catch(err){ 
          console.error('Registration error:', err);
          alert('Hata: ' + (err.message || 'Kayıt olunamadı. Lütfen tekrar deneyin.'));
        }
      });
    }

    // User dashboard
    if ($('#createListingForm')) {
      if (!(await ensureAuth('User'))) return;
      await loadUserCategories($('#userCategories'));

      $('#createListingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        if (!form.lat.value || !form.lng.value) { alert('Lütfen haritadan konum seçiniz.'); return; }
        // Tarihi ISO formatına çevir (UTC)
        const eventDate = form.eventDate.value ? new Date(form.eventDate.value + 'T00:00:00Z').toISOString() : null;
        
        const payload = {
          title: form.title.value,
          description: form.description.value,
          eventDate: eventDate,
          location: form.location.value,
          budget: parseFloat(form.budget.value),
          categoryId: parseInt(form.categoryId.value),
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
          // Form alanlarını temizle
          form.lat.value = '';
          form.lng.value = '';
          
          await loadMyListings();
        }catch(err){ 
          console.error('Listing creation error:', err);
          alert('Hata: ' + (err.message || 'İlan oluşturulamadı. Lütfen tekrar deneyin.'));
        }
      });

      async function loadMyListings(){
        const list = await api('/api/listings/mine');
        $('#myListings').innerHTML = list.map(myListingCard).join('');
        $$('#myListings [data-bids]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-bids');
            const bids = await api(`/api/listings/${id}/bids`);
            $('#bidsContainer').innerHTML = bids.length ? bids.map(bidCard).join('') : '<div class="muted">Henüz teklif yok.</div>';
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
      await loadMyListings();
    }

    // Vendor dashboard
    if ($('#openListings')) {
      if (!(await ensureAuth('Vendor'))) return;
      async function loadOpen(){
        const list = await api('/api/listings');
        $('#openListings').innerHTML = list.map(l => `
          <div class="card listing-card">
            <div class="row between center">
              <span class="badge">${l.categoryName}</span>
              <span class="badge">${l.location || '-'}</span>
            </div>
            <h4>${l.title}</h4>
            <p class="muted">${l.description ? l.description.slice(0,120) : ''}</p>
            <div class="row between center">
              <small>${new Date(l.eventDate).toLocaleDateString('tr-TR')}</small>
              <small class="price">${fmt.format(l.budget)} ₺</small>
            </div>
            <div class="row gap">
              <a class="btn small" href="/Listings/Detail?id=${l.id}">Detay</a>
            </div>
            <form class="form" data-bid="${l.id}">
              <input name="amount" class="input" type="number" placeholder="Teklif (₺)" min="1" required />
              <input name="message" class="input" placeholder="Mesaj (opsiyonel)" />
              <button class="btn small primary" type="submit">Teklif Ver</button>
            </form>
          </div>
        `).join('');

        $$('#openListings [data-bid]').forEach(form => {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = form.getAttribute('data-bid');
            const payload = {
              eventListingId: id,
              amount: parseFloat(form.amount.value),
              message: form.message.value
            };
            try{
              await api('/api/bids', { method:'POST', body: JSON.stringify(payload) });
              alert('Teklif gönderildi.');
              form.reset();
              await loadMyBids();
            }catch(err){ 
          console.error('Registration error:', err);
          alert('Hata: ' + (err.message || 'Kayıt olunamadı. Lütfen tekrar deneyin.'));
        }
          });
        });
      }

      async function loadMyBids(){
        const bids = await api('/api/bids/mine');
        $('#myBids').innerHTML = bids.map(b => `
          <div class="card">
            <div class="row between center">
              <strong>${b.listingTitle}</strong>
              <span class="badge">${b.category}</span>
            </div>
            <p class="price">${fmt.format(b.amount)} ₺</p>
            <p class="muted">${b.message || ''}</p>
            <span class="badge">${b.status}</span>
          </div>
        `).join('');
      }

      await loadOpen();
      await loadMyBids();
    }
  });
})();
