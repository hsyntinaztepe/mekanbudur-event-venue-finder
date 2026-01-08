using System.ComponentModel.DataAnnotations;

namespace MekanBudur.Api.Models
{
    public class VendorProfile
    {
        public Guid Id { get; set; } = Guid.NewGuid();

        public Guid UserId { get; set; }
        public User User { get; set; } = default!;

        [Required, MaxLength(160)]
        public string CompanyName { get; set; } = default!;

        [MaxLength(1000)]
        public string? Description { get; set; }

        [MaxLength(250)]
        public string? ServiceCategoriesCsv { get; set; }

        [MaxLength(500)]
        public string? SuitableForCsv { get; set; } // Hangi etkinlik için uygun? (CSV)

        // Venue Details
        [MaxLength(200)]
        public string? VenueType { get; set; } // Açık Alan, Kapalı Salon, Bahçeli, vb.
        
        public int? Capacity { get; set; } // Kapasite (kişi)
        
        [MaxLength(500)]
        public string? Amenities { get; set; } // Olanaklar (CSV: Otopark, Klima, Ses Sistemi, vb.)
        
        [MaxLength(100)]
        public string? PriceRange { get; set; } // Fiyat aralığı
        
        [MaxLength(20)]
        public string? PhoneNumber { get; set; }
        
        [MaxLength(200)]
        public string? Website { get; set; }
        
        [MaxLength(200)]
        public string? SocialMediaLinks { get; set; } // JSON veya CSV formatında
        
        [MaxLength(500)]
        public string? WorkingHours { get; set; } // Çalışma saatleri
        
        [MaxLength(2000)]
        public string? PhotoUrls { get; set; } // Fotoğraf URL'leri (CSV veya JSON)
        
        public bool IsVerified { get; set; } = false; // Admin onayı
        
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        
        public DateTime? UpdatedAtUtc { get; set; }

        // Geo: Vendor mekan konumu Geo serviste tutulur (RefType="Vendor", RefId=UserId)
    }
}
