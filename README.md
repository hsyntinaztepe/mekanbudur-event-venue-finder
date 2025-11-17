#  Evently - Özel Etkinlik Pazar Yeri

Modern mikroservis mimarisi ile geliştirilmiş, harita entegrasyonlu etkinlik ve hizmet pazar yeri platformu. Kullanıcılar etkinlik ilanları oluşturabilir, hizmet sağlayıcılar (vendor) bu ilanlara teklif verebilir.

## 📋 İçindekiler

- [Özellikler](#-özellikler)
- [Teknoloji Stack'i](#-teknoloji-stacki)
- [Proje Yapısı](#-proje-yapısı)
- [Kurulum](#-kurulum)
- [Kullanım](#-kullanım)
- [API Dokümantasyonu](#-api-dokümantasyonu)
- [Veritabanı Yapısı](#-veritabanı-yapısı)
- [Docker Yapılandırması](#-docker-yapılandırması)
- [Geliştirme Notları](#-geliştirme-notları)

## ✨ Özellikler

### 🔐 Kimlik Doğrulama
- JWT tabanlı kimlik doğrulama
- Kullanıcı (User) ve Hizmet Sağlayıcı (Vendor) rolleri
- Güvenli şifre hash'leme (ASP.NET Core Identity)

### 📝 İlan Yönetimi
- Etkinlik ilanları oluşturma ve yönetme
- Kategori bazlı filtreleme
- Bütçe ve konum bazlı arama
- İlan detay sayfaları

### 🗺️ Harita Entegrasyonu
- İlan oluştururken haritadan konum seçimi
- Vendor kayıt sırasında mekân konumu belirleme
- Latitude/Longitude ve radius desteği
- Adres etiketi kaydetme

### 💰 Teklif Sistemi
- Vendor'ların ilanlara teklif vermesi
- İlan sahibinin teklifleri görüntülemesi
- Teklif kabul/red işlemleri
- Teklif durumu takibi

### 🏢 Mikroservis Mimarisi
- Ana API servisi (ilan, kullanıcı, teklif yönetimi)
- Geo servisi (konum verileri yönetimi)
- Web frontend (Razor Pages)
- Servisler arası HTTP iletişim

## 🛠️ Teknoloji Stack'i

### Backend
- **.NET 8.0** - Modern C# framework
- **Entity Framework Core 8.0** - ORM (Code First yaklaşımı)
- **PostgreSQL 16** - İlişkisel veritabanı
- **JWT Bearer Authentication** - Token tabanlı kimlik doğrulama
- **ASP.NET Core Minimal APIs** - RESTful API endpoints

### Frontend
- **ASP.NET Core Razor Pages** - Server-side rendering
- **JavaScript** - İstemci tarafı etkileşimler

### DevOps & Infrastructure
- **Docker & Docker Compose** - Containerization
- **pgAdmin 4** - Veritabanı yönetim arayüzü
- **Swagger/OpenAPI** - API dokümantasyonu

## 📁 Proje Yapısı

```
evently-docker-dotnet/
├── src/
│   ├── Api/                    # Ana API servisi
│   │   ├── Data/              # DbContext ve veritabanı yapılandırması
│   │   ├── Models/            # Entity modelleri (User, EventListing, Bid, vb.)
│   │   ├── DTOs/              # Data Transfer Objects
│   │   ├── Services/          # İş mantığı servisleri
│   │   └── Program.cs         # API endpoint'leri ve yapılandırma
│   │
│   ├── Geo/                   # Geo servisi (konum yönetimi)
│   │   ├── Data/              # GeoDbContext
│   │   ├── Models/            # Place modeli
│   │   └── Program.cs         # Geo API endpoint'leri
│   │
│   └── Web/                   # Frontend (Razor Pages)
│       ├── Pages/             # Razor sayfaları
│       └── wwwroot/           # Statik dosyalar (CSS, JS)
│
├── docker-compose.yml         # Docker servis yapılandırması
└── README.md                  # Bu dosya
```

## 🚀 Kurulum

### Gereksinimler

- [Docker](https://www.docker.com/get-started) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)
- .NET 8.0 SDK (geliştirme için, opsiyonel)

### Hızlı Başlangıç

1. **Projeyi klonlayın:**
   ```bash
   git clone <repository-url>
   cd evently-docker-dotnet
   ```

2. **Docker Compose ile tüm servisleri başlatın:**
   ```bash
   docker compose up --build
   ```

3. **Servislerin hazır olmasını bekleyin** (ilk başlatmada 1-2 dakika sürebilir)

4. **Erişim URL'leri:**
   - 🌐 **Web Frontend**: http://localhost:8080
   - 📡 **API (Swagger)**: http://localhost:8081/swagger
   - 🗺️ **Geo API (Swagger)**: http://localhost:8082/swagger
   - 🗄️ **pgAdmin**: http://localhost:5050

### Servisleri Durdurma

```bash
docker compose down
```

Verileri de silmek için:
```bash
docker compose down -v
```

## 💻 Kullanım

### Demo Hesaplar

Proje ilk başlatıldığında otomatik olarak demo hesaplar oluşturulur:

- **Kullanıcı (User)**
  - Email: `user@demo.com`
  - Şifre: `Pass123*`

- **Hizmet Sağlayıcı (Vendor)**
  - Email: `vendor@demo.com`
  - Şifre: `Pass123*`

### pgAdmin Kullanımı

pgAdmin'e http://localhost:5050 adresinden erişebilirsiniz.

**Giriş Bilgileri:**
- Email: `admin@mekanbudur.com`
- Password: `admin`

**Önemli:** pgAdmin'in tam başlaması 30-60 saniye sürebilir.

#### Veritabanı Bağlantısı Ekleme

1. Sol panelde **"Servers"** üzerine sağ tıklayın → **"Register" → "Server..."**

2. **Ana Veritabanı (evently):**
   - **General** → Name: `MekanBudur DB`
   - **Connection** → 
     - Host: `db` (Docker içinden) veya `host.docker.internal` (host makineden)
     - Port: `5432`
     - Database: `evently`
     - Username: `postgres`
     - Password: `postgres`

3. **Geo Veritabanı (evently_geo):**
   - **General** → Name: `MekanBudur Geo DB`
   - **Connection** →
     - Host: `geodb` (Docker içinden) veya `host.docker.internal` (host makineden)
     - Port: `5432`
     - Database: `evently_geo`
     - Username: `postgres`
     - Password: `postgres`

## 📚 API Dokümantasyonu

### Ana API Endpoints

#### Kimlik Doğrulama
- `POST /api/auth/register` - Yeni kullanıcı kaydı
- `POST /api/auth/login` - Kullanıcı girişi

#### Kategoriler
- `GET /api/categories` - Tüm kategorileri listele

#### İlanlar
- `GET /api/listings` - İlanları listele (filtreli)
  - Query params: `categoryId`, `q`, `location`, `minBudget`, `maxBudget`
- `GET /api/listings/{id}` - İlan detayı
- `GET /api/listings/mine` - Kendi ilanlarım (Auth: User)
- `POST /api/listings` - Yeni ilan oluştur (Auth: User)

#### Teklifler
- `POST /api/bids` - Teklif ver (Auth: Vendor)
- `GET /api/bids/mine` - Tekliflerim (Auth: Vendor)
- `GET /api/listings/{id}/bids` - İlan teklifleri (Auth: İlan sahibi)
- `POST /api/bids/{id}/accept` - Teklif kabul et (Auth: User)

#### Geo Proxy
- `GET /api/geo/listings/{id}` - İlan konum bilgisi
- `GET /api/geo/vendors/{userId}` - Vendor mekân konumu

### Geo API Endpoints

- `POST /api/places/upsert` - Konum ekle/güncelle
- `GET /api/places/by-ref` - Referans tip ve ID'ye göre konum getir
  - Query params: `refType` (Listing/Vendor), `refId`

**Detaylı API dokümantasyonu için:** http://localhost:8081/swagger

## 🗄️ Veritabanı Yapısı

### Ana Veritabanı (evently)

#### Tablolar
- **Users** - Kullanıcı bilgileri (User/Vendor rolleri)
- **VendorProfiles** - Vendor profil bilgileri
- **ServiceCategories** - Hizmet kategorileri (Venue, Bakery, Photographer, vb.)
- **EventListings** - Etkinlik ilanları
- **Bids** - Teklifler

#### İlişkiler
- User ↔ EventListing (1:N)
- User ↔ VendorProfile (1:1)
- EventListing ↔ Bid (1:N)
- EventListing ↔ ServiceCategory (N:1)

### Geo Veritabanı (evently_geo)

#### Tablolar
- **Places** - Konum bilgileri
  - `RefType`: "Listing" veya "Vendor"
  - `RefId`: İlgili entity'nin ID'si
  - `Latitude`, `Longitude`: Koordinatlar
  - `Radius`: Yarıçap (metre)
  - `AddressLabel`: Adres etiketi

### Veritabanı Bağlantı Bilgileri

**Ana DB:**
- Host: `localhost:5432`
- Database: `evently`
- User: `postgres`
- Password: `postgres`

**Geo DB:**
- Host: `localhost:5433`
- Database: `evently_geo`
- User: `postgres`
- Password: `postgres`

## 🐳 Docker Yapılandırması

### Servisler

| Servis | Port | Açıklama |
|--------|------|----------|
| `web` | 8080 | Frontend (Razor Pages) |
| `api` | 8081 | Ana API servisi |
| `geo` | 8082 | Geo servisi |
| `db` | 5432 | PostgreSQL (Ana DB) |
| `geodb` | 5433 | PostgreSQL (Geo DB) |
| `pgadmin` | 5050 | pgAdmin web arayüzü |

### Volume'lar

- `db_data` - Ana veritabanı verileri
- `geodb_data` - Geo veritabanı verileri
- `pgadmin_data` - pgAdmin yapılandırması

### Health Checks

Tüm servisler health check ile izlenir. Servisler sağlıklı olduğunda bağımlı servisler başlatılır.

## 🔧 Geliştirme Notları

### Code First Yaklaşımı

Proje **Entity Framework Core Code First** yaklaşımı kullanmaktadır:

- Model sınıfları `Models/` klasöründe tanımlı
- DbContext'ler `Data/` klasöründe
- İlişkiler `OnModelCreating` metodunda yapılandırılmış
- Şema oluşturma: `EnsureCreated()` (demo için)

**⚠️ Önemli:** Üretim ortamında `EnsureCreated()` yerine **EF Core Migrations** kullanılmalıdır.

### Environment Variables

Docker Compose içinde environment variable'lar ile yapılandırma yapılır:

```yaml
ConnectionStrings__Default=Host=db;Port=5432;Database=evently;...
Jwt__Key=supersecret_dev_jwt_key_change_me
GeoService__BaseUrl=http://geo:8080
```

### Seed Data

İlk başlatmada otomatik olarak:
- Demo kullanıcılar oluşturulur
- Hizmet kategorileri eklenir
- Örnek ilanlar oluşturulur

### CORS Yapılandırması

Geo servisi tüm origin'lere açık (`*`). Üretimde spesifik origin'ler belirtilmelidir.

### JWT Token

- Development için basit bir key kullanılmaktadır
- Üretimde güçlü, güvenli bir key kullanılmalıdır

## 📝 Lisans

Bu proje eğitim/demo amaçlı geliştirilmiştir.

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📧 İletişim

Sorularınız için issue açabilirsiniz.

---

⭐ Bu projeyi beğendiyseniz yıldız vermeyi unutmayın!
