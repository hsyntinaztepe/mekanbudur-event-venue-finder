using MekanBudur.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace MekanBudur.Api.Services
{
    public static class MigrationService
    {
        public static void Migrate(AppDbContext db)
        {
            try
            {
                // 1. Check if EventListingItems table exists
                var tableExists = false;
                try
                {
                    var count = db.Database.ExecuteSqlRaw("SELECT count(*) FROM \"EventListingItems\"");
                    tableExists = true;
                }
                catch
                {
                    tableExists = false;
                }

                if (!tableExists)
                {
                    Console.WriteLine("Migrating database to multi-category structure...");

                    // 2. Create Tables
                    db.Database.ExecuteSqlRaw(@"
                        CREATE TABLE ""EventListingItems"" (
                            ""Id"" uuid NOT NULL,
                            ""EventListingId"" uuid NOT NULL,
                            ""ServiceCategoryId"" integer NOT NULL,
                            ""Budget"" numeric NOT NULL,
                            ""Status"" integer NOT NULL,
                            CONSTRAINT ""PK_EventListingItems"" PRIMARY KEY (""Id""),
                            CONSTRAINT ""FK_EventListingItems_EventListings_EventListingId"" FOREIGN KEY (""EventListingId"") REFERENCES ""EventListings"" (""Id"") ON DELETE CASCADE,
                            CONSTRAINT ""FK_EventListingItems_ServiceCategories_ServiceCategoryId"" FOREIGN KEY (""ServiceCategoryId"") REFERENCES ""ServiceCategories"" (""Id"") ON DELETE CASCADE
                        );
                    ");

                    db.Database.ExecuteSqlRaw(@"
                        CREATE TABLE ""BidItems"" (
                            ""Id"" uuid NOT NULL,
                            ""BidId"" uuid NOT NULL,
                            ""EventListingItemId"" uuid NOT NULL,
                            ""Amount"" numeric NOT NULL,
                            CONSTRAINT ""PK_BidItems"" PRIMARY KEY (""Id""),
                            CONSTRAINT ""FK_BidItems_Bids_BidId"" FOREIGN KEY (""BidId"") REFERENCES ""Bids"" (""Id"") ON DELETE CASCADE,
                            CONSTRAINT ""FK_BidItems_EventListingItems_EventListingItemId"" FOREIGN KEY (""EventListingItemId"") REFERENCES ""EventListingItems"" (""Id"") ON DELETE CASCADE
                        );
                    ");

                    db.Database.ExecuteSqlRaw(@"
                        CREATE INDEX ""IX_EventListingItems_EventListingId"" ON ""EventListingItems"" (""EventListingId"");
                        CREATE INDEX ""IX_EventListingItems_ServiceCategoryId"" ON ""EventListingItems"" (""ServiceCategoryId"");
                        CREATE INDEX ""IX_BidItems_BidId"" ON ""BidItems"" (""BidId"");
                        CREATE INDEX ""IX_BidItems_EventListingItemId"" ON ""BidItems"" (""EventListingItemId"");
                    ");

                    // 3. Migrate Data
                    // Migrate EventListings -> EventListingItems
                    // Note: We generate a new UUID for each item using gen_random_uuid() if available, or we can do it in C# code.
                    // Postgres 13+ has gen_random_uuid().
                    db.Database.ExecuteSqlRaw(@"
                        INSERT INTO ""EventListingItems"" (""Id"", ""EventListingId"", ""ServiceCategoryId"", ""Budget"", ""Status"")
                        SELECT gen_random_uuid(), ""Id"", ""CategoryId"", ""Budget"", ""Status""
                        FROM ""EventListings""
                        WHERE ""CategoryId"" IS NOT NULL;
                    ");

                    // Migrate Bids -> BidItems
                    // This is tricky because we need to link Bid -> EventListingItem.
                    // A Bid is linked to an EventListing. That EventListing has (now) one EventListingItem (migrated above).
                    // We need to find that Item.
                    db.Database.ExecuteSqlRaw(@"
                        INSERT INTO ""BidItems"" (""Id"", ""BidId"", ""EventListingItemId"", ""Amount"")
                        SELECT gen_random_uuid(), b.""Id"", eli.""Id"", b.""Amount""
                        FROM ""Bids"" b
                        JOIN ""EventListings"" el ON b.""EventListingId"" = el.""Id""
                        JOIN ""EventListingItems"" eli ON eli.""EventListingId"" = el.""Id""
                        WHERE eli.""ServiceCategoryId"" = el.""CategoryId"";
                    ");
                    
                    // 4. Make columns nullable (This is handled by EF Core model update, but we can do it here to be safe or just let EF handle it if we used migrations)
                    // Since we are not using EF migrations, we should alter the table to allow nulls for legacy columns.
                    db.Database.ExecuteSqlRaw(@"
                        ALTER TABLE ""EventListings"" ALTER COLUMN ""CategoryId"" DROP NOT NULL;
                        ALTER TABLE ""EventListings"" ALTER COLUMN ""Budget"" DROP NOT NULL;
                    ");

                    Console.WriteLine("Migration completed successfully.");
                }

                // 5. Add Visibility column if it doesn't exist
                var visibilityExists = false;
                try
                {
                    db.Database.ExecuteSqlRaw("SELECT \"Visibility\" FROM \"EventListings\" LIMIT 1");
                    visibilityExists = true;
                }
                catch
                {
                    visibilityExists = false;
                }

                if (!visibilityExists)
                {
                    Console.WriteLine("Adding Visibility column to EventListings...");
                    db.Database.ExecuteSqlRaw(@"
                        ALTER TABLE ""EventListings"" 
                        ADD COLUMN ""Visibility"" integer NOT NULL DEFAULT 1;
                    ");
                    Console.WriteLine("Visibility column added successfully.");
                }

                // 6. Add new VendorProfile columns if they don't exist
                var venueTypeExists = false;
                try
                {
                    db.Database.ExecuteSqlRaw("SELECT \"VenueType\" FROM \"VendorProfiles\" LIMIT 1");
                    venueTypeExists = true;
                }
                catch
                {
                    venueTypeExists = false;
                }

                if (!venueTypeExists)
                {
                    Console.WriteLine("Adding new columns to VendorProfiles...");
                    db.Database.ExecuteSqlRaw(@"
                        ALTER TABLE ""VendorProfiles"" 
                        ADD COLUMN ""VenueType"" varchar(200),
                        ADD COLUMN ""Capacity"" integer,
                        ADD COLUMN ""Amenities"" varchar(500),
                        ADD COLUMN ""PriceRange"" varchar(100),
                        ADD COLUMN ""PhoneNumber"" varchar(20),
                        ADD COLUMN ""Website"" varchar(200),
                        ADD COLUMN ""SocialMediaLinks"" varchar(200),
                        ADD COLUMN ""WorkingHours"" varchar(500),
                        ADD COLUMN ""PhotoUrls"" varchar(2000),
                        ADD COLUMN ""IsVerified"" boolean NOT NULL DEFAULT false,
                        ADD COLUMN ""CreatedAtUtc"" timestamp NOT NULL DEFAULT NOW(),
                        ADD COLUMN ""UpdatedAtUtc"" timestamp;
                    ");
                    
                    // Update Description column max length
                    db.Database.ExecuteSqlRaw(@"
                        ALTER TABLE ""VendorProfiles"" 
                        ALTER COLUMN ""Description"" TYPE varchar(1000);
                    ");
                    
                    Console.WriteLine("VendorProfiles columns added successfully.");
                }

                // 6b. Add SuitableForCsv column if it doesn't exist
                var suitableForExists = false;
                try
                {
                    db.Database.ExecuteSqlRaw("SELECT \"SuitableForCsv\" FROM \"VendorProfiles\" LIMIT 1");
                    suitableForExists = true;
                }
                catch
                {
                    suitableForExists = false;
                }

                if (!suitableForExists)
                {
                    Console.WriteLine("Adding SuitableForCsv column to VendorProfiles...");
                    db.Database.ExecuteSqlRaw(@"
                        ALTER TABLE ""VendorProfiles"" 
                        ADD COLUMN ""SuitableForCsv"" varchar(500);
                    ");
                    Console.WriteLine("SuitableForCsv column added successfully.");
                }

                // 7. Create VendorRatings table if it doesn't exist
                var vendorRatingsTableExists = false;
                try
                {
                    db.Database.ExecuteSqlRaw("SELECT count(*) FROM \"VendorRatings\"");
                    vendorRatingsTableExists = true;
                }
                catch
                {
                    vendorRatingsTableExists = false;
                }

                if (!vendorRatingsTableExists)
                {
                    Console.WriteLine("Creating VendorRatings table...");
                    db.Database.ExecuteSqlRaw(@"
                        CREATE TABLE ""VendorRatings"" (
                            ""Id"" uuid NOT NULL,
                            ""VendorUserId"" uuid NOT NULL,
                            ""UserId"" uuid NOT NULL,
                            ""Rating"" integer NOT NULL,
                            ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                            ""UpdatedAtUtc"" timestamp with time zone NULL,
                            CONSTRAINT ""PK_VendorRatings"" PRIMARY KEY (""Id""),
                            CONSTRAINT ""FK_VendorRatings_Users_UserId"" FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
                            CONSTRAINT ""FK_VendorRatings_Users_VendorUserId"" FOREIGN KEY (""VendorUserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
                            CONSTRAINT ""CK_VendorRatings_Rating_Range"" CHECK (""Rating"" >= 1 AND ""Rating"" <= 5)
                        );
                    ");

                    db.Database.ExecuteSqlRaw(@"
                        CREATE UNIQUE INDEX ""IX_VendorRatings_VendorUserId_UserId"" ON ""VendorRatings"" (""VendorUserId"", ""UserId"");
                        CREATE INDEX ""IX_VendorRatings_VendorUserId"" ON ""VendorRatings"" (""VendorUserId"");
                    ");

                    Console.WriteLine("VendorRatings table created successfully.");
                }

                // 8. Create VendorReviews table if it doesn't exist
                var vendorReviewsTableExists = false;
                try
                {
                    db.Database.ExecuteSqlRaw("SELECT count(*) FROM \"VendorReviews\"");
                    vendorReviewsTableExists = true;
                }
                catch
                {
                    vendorReviewsTableExists = false;
                }

                if (!vendorReviewsTableExists)
                {
                    Console.WriteLine("Creating VendorReviews table...");
                    db.Database.ExecuteSqlRaw(@"
                        CREATE TABLE ""VendorReviews"" (
                            ""Id"" uuid NOT NULL,
                            ""VendorUserId"" uuid NOT NULL,
                            ""UserId"" uuid NOT NULL,
                            ""Comment"" varchar(1000) NOT NULL,
                            ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                            ""UpdatedAtUtc"" timestamp with time zone NULL,
                            CONSTRAINT ""PK_VendorReviews"" PRIMARY KEY (""Id""),
                            CONSTRAINT ""FK_VendorReviews_Users_UserId"" FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
                            CONSTRAINT ""FK_VendorReviews_Users_VendorUserId"" FOREIGN KEY (""VendorUserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
                        );
                    ");

                    db.Database.ExecuteSqlRaw(@"
                        CREATE UNIQUE INDEX ""IX_VendorReviews_VendorUserId_UserId"" ON ""VendorReviews"" (""VendorUserId"", ""UserId"");
                        CREATE INDEX ""IX_VendorReviews_VendorUserId"" ON ""VendorReviews"" (""VendorUserId"");
                    ");

                    Console.WriteLine("VendorReviews table created successfully.");
                }

                // 9. Create VendorQuestions table if it doesn't exist
                var vendorQuestionsTableExists = false;
                try
                {
                    db.Database.ExecuteSqlRaw("SELECT count(*) FROM \"VendorQuestions\"");
                    vendorQuestionsTableExists = true;
                }
                catch
                {
                    vendorQuestionsTableExists = false;
                }

                if (!vendorQuestionsTableExists)
                {
                    Console.WriteLine("Creating VendorQuestions table...");
                    db.Database.ExecuteSqlRaw(@"
                        CREATE TABLE ""VendorQuestions"" (
                            ""Id"" uuid NOT NULL,
                            ""VendorUserId"" uuid NOT NULL,
                            ""UserId"" uuid NOT NULL,
                            ""Question"" varchar(500) NOT NULL,
                            ""Answer"" varchar(1000) NULL,
                            ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                            ""AnsweredAtUtc"" timestamp with time zone NULL,
                            CONSTRAINT ""PK_VendorQuestions"" PRIMARY KEY (""Id""),
                            CONSTRAINT ""FK_VendorQuestions_Users_UserId"" FOREIGN KEY (""UserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE,
                            CONSTRAINT ""FK_VendorQuestions_Users_VendorUserId"" FOREIGN KEY (""VendorUserId"") REFERENCES ""Users"" (""Id"") ON DELETE CASCADE
                        );
                    ");

                    db.Database.ExecuteSqlRaw(@"
                        CREATE INDEX ""IX_VendorQuestions_VendorUserId"" ON ""VendorQuestions"" (""VendorUserId"");
                        CREATE INDEX ""IX_VendorQuestions_CreatedAtUtc"" ON ""VendorQuestions"" (""CreatedAtUtc"");
                    ");

                    Console.WriteLine("VendorQuestions table created successfully.");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Migration failed: {ex.Message}");
                // Continue anyway, maybe it was already migrated or partial failure
            }
        }
    }
}
