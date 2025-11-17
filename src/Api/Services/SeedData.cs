using MekanBudur.Api.Data;
using MekanBudur.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace MekanBudur.Api.Services
{
    public static class SeedData
    {
        public static void EnsureSeeded(AppDbContext db, PasswordHasher<User> hasher)
        {
            if (!db.ServiceCategories.Any())
            {
                db.ServiceCategories.AddRange(
                    new ServiceCategory { Name = "Venue" },
                    new ServiceCategory { Name = "Bakery" },
                    new ServiceCategory { Name = "Photographer" },
                    new ServiceCategory { Name = "Catering" },
                    new ServiceCategory { Name = "Music/DJ" }
                );
                db.SaveChanges();
            }

            if (!db.Users.Any())
            {
                var user = new User
                {
                    Email = "user@demo.com",
                    DisplayName = "Demo Kullanıcı",
                    Role = UserRole.User
                };
                user.PasswordHash = hasher.HashPassword(user, "Pass123*");

                var vendor = new User
                {
                    Email = "vendor@demo.com",
                    DisplayName = "Demo Kurumsal",
                    Role = UserRole.Vendor
                };
                vendor.PasswordHash = hasher.HashPassword(vendor, "Pass123*");

                db.Users.AddRange(user, vendor);
                db.SaveChanges();

                db.VendorProfiles.Add(new VendorProfile
                {
                    UserId = vendor.Id,
                    CompanyName = "Gökyüzü Organizasyon",
                    Description = "Düğün, fotoğraf, mekan ve ikram çözümleri.",
                    ServiceCategoriesCsv = "Venue,Photographer,Bakery"
                });
                db.SaveChanges();

                var category = db.ServiceCategories.First();
                db.EventListings.Add(new EventListing
                {
                    Title = "Yaz Düğünü - Açık Hava",
                    Description = "150 kişilik, Boğaz manzaralı mekan arıyoruz.",
                    EventDate = DateTime.UtcNow.AddMonths(2),
                    Location = "İstanbul",
                    Budget = 150000m,
                    CategoryId = category.Id,
                    CreatedByUserId = user.Id,
                    Status = ListingStatus.Open
                });
                db.SaveChanges();
            }
        }
    }
}
