using MekanBudur.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace MekanBudur.Api.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) {}

        public DbSet<User> Users { get; set; } = default!;
        public DbSet<VendorProfile> VendorProfiles { get; set; } = default!;
        public DbSet<ServiceCategory> ServiceCategories { get; set; } = default!;
        public DbSet<EventListing> EventListings { get; set; } = default!;
        public DbSet<EventListingItem> EventListingItems { get; set; } = default!;
        public DbSet<Bid> Bids { get; set; } = default!;
        public DbSet<BidItem> BidItems { get; set; } = default!;
        public DbSet<VendorRating> VendorRatings { get; set; } = default!;
        public DbSet<VendorReview> VendorReviews { get; set; } = default!;
        public DbSet<VendorQuestion> VendorQuestions { get; set; } = default!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>()
                .HasIndex(u => u.Email).IsUnique();

            modelBuilder.Entity<User>()
                .HasMany(u => u.ListingsCreated)
                .WithOne(l => l.CreatedByUser)
                .HasForeignKey(l => l.CreatedByUserId);

            modelBuilder.Entity<VendorProfile>()
                .HasOne(v => v.User)
                .WithOne(u => u.VendorProfile!)
                .HasForeignKey<VendorProfile>(v => v.UserId);

            modelBuilder.Entity<EventListing>()
                .HasOne(l => l.Category)
                .WithMany()
                .HasForeignKey(l => l.CategoryId);

            modelBuilder.Entity<Bid>()
                .HasOne(b => b.EventListing)
                .WithMany(l => l.Bids)
                .HasForeignKey(b => b.EventListingId);

            modelBuilder.Entity<Bid>()
                .HasOne(b => b.VendorUser)
                .WithMany()
                .HasForeignKey(b => b.VendorUserId);

            modelBuilder.Entity<VendorRating>(entity =>
            {
                entity.HasIndex(r => new { r.VendorUserId, r.UserId })
                    .IsUnique();

                entity.HasOne(r => r.User)
                    .WithMany()
                    .HasForeignKey(r => r.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(r => r.VendorUser)
                    .WithMany()
                    .HasForeignKey(r => r.VendorUserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.ToTable(t => t.HasCheckConstraint("CK_VendorRatings_Rating_Range", "\"Rating\" >= 1 AND \"Rating\" <= 5"));
            });

            modelBuilder.Entity<VendorReview>(entity =>
            {
                entity.HasIndex(r => new { r.VendorUserId, r.UserId }).IsUnique();

                entity.HasOne(r => r.User)
                    .WithMany()
                    .HasForeignKey(r => r.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(r => r.VendorUser)
                    .WithMany()
                    .HasForeignKey(r => r.VendorUserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<VendorQuestion>(entity =>
            {
                entity.HasIndex(q => q.VendorUserId);

                entity.HasOne(q => q.User)
                    .WithMany()
                    .HasForeignKey(q => q.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(q => q.VendorUser)
                    .WithMany()
                    .HasForeignKey(q => q.VendorUserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });
        }
    }
}
