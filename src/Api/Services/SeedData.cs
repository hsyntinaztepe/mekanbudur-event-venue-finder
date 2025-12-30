using MekanBudur.Api.Data;
using MekanBudur.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace MekanBudur.Api.Services
{
    public static class SeedData
    {
        public static async Task EnsureSeededAsync(AppDbContext db, PasswordHasher<User> hasher, GeoClient geo)
        {
            if (!db.ServiceCategories.Any())
            {
                db.ServiceCategories.AddRange(
                    new ServiceCategory { Name = "Mekan" },
                    new ServiceCategory { Name = "Pastane" },
                    new ServiceCategory { Name = "Fotoğrafçı" },
                    new ServiceCategory { Name = "Yemek/Catering" },
                    new ServiceCategory { Name = "Müzik/DJ" }
                );
                db.SaveChanges();
            }

            if (!db.Users.Any())
            {
                var users = new List<User>();
                
                // Create 8 demo users
                var userEmails = new[] { 
                    "ayse.yilmaz@demo.com", 
                    "mehmet.kaya@demo.com", 
                    "zeynep.demir@demo.com",
                    "ahmet.celik@demo.com",
                    "fatma.sahin@demo.com",
                    "mustafa.ozturk@demo.com",
                    "elif.yildiz@demo.com",
                    "emre.arslan@demo.com"
                };
                
                var userNames = new[] {
                    "Ayşe Yılmaz",
                    "Mehmet Kaya", 
                    "Zeynep Demir",
                    "Ahmet Çelik",
                    "Fatma Şahin",
                    "Mustafa Öztürk",
                    "Elif Yıldız",
                    "Emre Arslan"
                };

                for (int i = 0; i < userEmails.Length; i++)
                {
                    var user = new User
                    {
                        Email = userEmails[i],
                        DisplayName = userNames[i],
                        Role = UserRole.User
                    };
                    user.PasswordHash = hasher.HashPassword(user, "demo123");
                    users.Add(user);
                }

                // Add demo vendor
                var vendor = new User
                {
                    Email = "vendor@demo.com",
                    DisplayName = "Demo Kurumsal",
                    Role = UserRole.Vendor
                };
                vendor.PasswordHash = hasher.HashPassword(vendor, "demo123");
                users.Add(vendor);

                // Add demo admin
                var admin = new User
                {
                    Email = "admin@demo.com",
                    DisplayName = "Demo Admin",
                    Role = UserRole.Admin
                };
                admin.PasswordHash = hasher.HashPassword(admin, "demo123");
                users.Add(admin);

                db.Users.AddRange(users);
                db.SaveChanges();

                // Create vendor profile
                db.VendorProfiles.Add(new VendorProfile
                {
                    UserId = vendor.Id,
                    CompanyName = "Gökyüzü Organizasyon",
                    Description = "Düğün, fotoğraf, mekan ve ikram çözümleri.",
                    ServiceCategoriesCsv = "Mekan,Fotoğrafçı,Pastane"
                });
                db.SaveChanges();

                // Get categories
                var mekanCat = db.ServiceCategories.First(c => c.Name == "Mekan");
                var fotografCat = db.ServiceCategories.First(c => c.Name == "Fotoğrafçı");
                var pastaneCat = db.ServiceCategories.First(c => c.Name == "Pastane");
                var cateringCat = db.ServiceCategories.First(c => c.Name == "Yemek/Catering");
                var muzikCat = db.ServiceCategories.First(c => c.Name == "Müzik/DJ");

                var listings = new List<EventListing>();

                // Listing 1 - Ayşe's Wedding
                var listing1 = new EventListing
                {
                    Title = "Yaz Düğünü - Açık Hava",
                    Description = "150 kişilik, Boğaz manzaralı düğün organizasyonu. Mekan, fotoğraf çekimi ve pasta hizmeti arıyoruz.",
                    EventDate = DateTime.UtcNow.AddMonths(3),
                    Location = "İstanbul, Beşiktaş",
                    CreatedByUserId = users[0].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-5)
                };
                listing1.Items.Add(new EventListingItem { ServiceCategoryId = mekanCat.Id, Budget = 80000m, Status = ListingStatus.Open });
                listing1.Items.Add(new EventListingItem { ServiceCategoryId = fotografCat.Id, Budget = 15000m, Status = ListingStatus.Open });
                listing1.Items.Add(new EventListingItem { ServiceCategoryId = pastaneCat.Id, Budget = 5000m, Status = ListingStatus.Open });
                listings.Add(listing1);

                // Listing 2 - Mehmet's Birthday
                var listing2 = new EventListing
                {
                    Title = "30 Yaş Doğum Günü Partisi",
                    Description = "80 kişilik doğum günü organizasyonu. DJ, catering ve pasta servisi gerekli.",
                    EventDate = DateTime.UtcNow.AddMonths(1),
                    Location = "Ankara, Çankaya",
                    CreatedByUserId = users[1].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-3)
                };
                listing2.Items.Add(new EventListingItem { ServiceCategoryId = muzikCat.Id, Budget = 8000m, Status = ListingStatus.Open });
                listing2.Items.Add(new EventListingItem { ServiceCategoryId = cateringCat.Id, Budget = 12000m, Status = ListingStatus.Open });
                listing2.Items.Add(new EventListingItem { ServiceCategoryId = pastaneCat.Id, Budget = 2000m, Status = ListingStatus.Open });
                listings.Add(listing2);

                // Listing 3 - Zeynep's Engagement
                var listing3 = new EventListing
                {
                    Title = "Nişan Töreni - Kış Organizasyonu",
                    Description = "100 kişilik nişan töreni. Kapalı mekan, fotoğrafçı ve catering hizmeti arıyoruz.",
                    EventDate = DateTime.UtcNow.AddMonths(2),
                    Location = "İzmir, Alsancak",
                    CreatedByUserId = users[2].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-7)
                };
                listing3.Items.Add(new EventListingItem { ServiceCategoryId = mekanCat.Id, Budget = 45000m, Status = ListingStatus.Open });
                listing3.Items.Add(new EventListingItem { ServiceCategoryId = fotografCat.Id, Budget = 10000m, Status = ListingStatus.Open });
                listing3.Items.Add(new EventListingItem { ServiceCategoryId = cateringCat.Id, Budget = 15000m, Status = ListingStatus.Open });
                listings.Add(listing3);

                // Listing 4 - Ahmet's Corporate Event
                var listing4 = new EventListing
                {
                    Title = "Şirket Yıl Sonu Partisi",
                    Description = "200 kişilik kurumsal etkinlik. Mekan, catering ve müzik organizasyonu gerekli.",
                    EventDate = DateTime.UtcNow.AddMonths(4),
                    Location = "İstanbul, Maslak",
                    CreatedByUserId = users[3].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-2)
                };
                listing4.Items.Add(new EventListingItem { ServiceCategoryId = mekanCat.Id, Budget = 60000m, Status = ListingStatus.Open });
                listing4.Items.Add(new EventListingItem { ServiceCategoryId = cateringCat.Id, Budget = 25000m, Status = ListingStatus.Open });
                listing4.Items.Add(new EventListingItem { ServiceCategoryId = muzikCat.Id, Budget = 12000m, Status = ListingStatus.Open });
                listings.Add(listing4);

                // Listing 5 - Fatma's Baby Shower
                var listing5 = new EventListing
                {
                    Title = "Baby Shower Organizasyonu",
                    Description = "40 kişilik baby shower etkinliği. Pasta ve fotoğraf çekimi istiyoruz.",
                    EventDate = DateTime.UtcNow.AddDays(45),
                    Location = "Bursa, Nilüfer",
                    CreatedByUserId = users[4].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-1)
                };
                listing5.Items.Add(new EventListingItem { ServiceCategoryId = pastaneCat.Id, Budget = 3000m, Status = ListingStatus.Open });
                listing5.Items.Add(new EventListingItem { ServiceCategoryId = fotografCat.Id, Budget = 5000m, Status = ListingStatus.Open });
                listings.Add(listing5);

                // Listing 6 - Mustafa's Wedding
                var listing6 = new EventListing
                {
                    Title = "Kış Düğünü - Salon",
                    Description = "250 kişilik düğün organizasyonu. Tam paket hizmet: mekan, catering, müzik, fotoğraf ve pasta.",
                    EventDate = DateTime.UtcNow.AddMonths(5),
                    Location = "Antalya, Lara",
                    CreatedByUserId = users[5].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-10)
                };
                listing6.Items.Add(new EventListingItem { ServiceCategoryId = mekanCat.Id, Budget = 120000m, Status = ListingStatus.Open });
                listing6.Items.Add(new EventListingItem { ServiceCategoryId = cateringCat.Id, Budget = 40000m, Status = ListingStatus.Open });
                listing6.Items.Add(new EventListingItem { ServiceCategoryId = muzikCat.Id, Budget = 15000m, Status = ListingStatus.Open });
                listing6.Items.Add(new EventListingItem { ServiceCategoryId = fotografCat.Id, Budget = 20000m, Status = ListingStatus.Open });
                listing6.Items.Add(new EventListingItem { ServiceCategoryId = pastaneCat.Id, Budget = 8000m, Status = ListingStatus.Open });
                listings.Add(listing6);

                // Listing 7 - Elif's Graduation
                var listing7 = new EventListing
                {
                    Title = "Mezuniyet Partisi",
                    Description = "60 kişilik mezuniyet kutlaması. DJ ve catering hizmeti arıyoruz.",
                    EventDate = DateTime.UtcNow.AddMonths(2).AddDays(15),
                    Location = "Eskişehir, Odunpazarı",
                    CreatedByUserId = users[6].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-4)
                };
                listing7.Items.Add(new EventListingItem { ServiceCategoryId = muzikCat.Id, Budget = 6000m, Status = ListingStatus.Open });
                listing7.Items.Add(new EventListingItem { ServiceCategoryId = cateringCat.Id, Budget = 9000m, Status = ListingStatus.Open });
                listings.Add(listing7);

                // Listing 8 - Emre's Anniversary
                var listing8 = new EventListing
                {
                    Title = "Evlilik Yıldönümü Sürprizi",
                    Description = "30 kişilik romantik akşam yemeği organizasyonu. Mekan ve fotoğrafçı gerekli.",
                    EventDate = DateTime.UtcNow.AddDays(60),
                    Location = "İstanbul, Bebek",
                    CreatedByUserId = users[7].Id,
                    Status = ListingStatus.Open,
                    CreatedAtUtc = DateTime.UtcNow.AddDays(-6)
                };
                listing8.Items.Add(new EventListingItem { ServiceCategoryId = mekanCat.Id, Budget = 25000m, Status = ListingStatus.Open });
                listing8.Items.Add(new EventListingItem { ServiceCategoryId = fotografCat.Id, Budget = 7000m, Status = ListingStatus.Open });
                listings.Add(listing8);

                db.EventListings.AddRange(listings);
                db.SaveChanges();

                // İlanlar için Geo bilgilerini ekle
                // İstanbul, Beşiktaş (Listing 1)
                await AddGeoAsync(geo, listing1.Id, 41.0419, 29.0072, 5000, "İstanbul, Beşiktaş");
                
                // Ankara, Çankaya (Listing 2)
                await AddGeoAsync(geo, listing2.Id, 39.9189, 32.8544, 3000, "Ankara, Çankaya");
                
                // İzmir, Alsancak (Listing 3)
                await AddGeoAsync(geo, listing3.Id, 38.4382, 27.1467, 4000, "İzmir, Alsancak");
                
                // İstanbul, Maslak (Listing 4)
                await AddGeoAsync(geo, listing4.Id, 41.1086, 29.0133, 6000, "İstanbul, Maslak");
                
                // Bursa, Nilüfer (Listing 5)
                await AddGeoAsync(geo, listing5.Id, 40.2086, 28.9667, 2500, "Bursa, Nilüfer");
                
                // Antalya, Lara (Listing 6)
                await AddGeoAsync(geo, listing6.Id, 36.8569, 30.7358, 7000, "Antalya, Lara");
                
                // Eskişehir, Odunpazarı (Listing 7)
                await AddGeoAsync(geo, listing7.Id, 39.7656, 30.5256, 3500, "Eskişehir, Odunpazarı");
                
                // İstanbul, Bebek (Listing 8)
                await AddGeoAsync(geo, listing8.Id, 41.0825, 29.0419, 2000, "İstanbul, Bebek");
            }
        }

        private static async Task AddGeoAsync(GeoClient geo, Guid listingId, double lat, double lng, double radius, string label)
        {
            try
            {
                await geo.UpsertAsync("Listing", listingId.ToString(), lat, lng, radius, label);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to add geo for listing {listingId}: {ex.Message}");
            }
        }
    }
}
