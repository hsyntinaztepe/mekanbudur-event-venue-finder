using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using MekanBudur.Api.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace MekanBudur.Api.Services
{
    public class JwtTokenService
    {
        private readonly IConfiguration _config;
        public JwtTokenService(IConfiguration config) => _config = config;

        public string Generate(User user)
        {
            var key = _config["Jwt:Key"] ?? "supersecret_dev_jwt_key_change_me";
            var issuer = _config["Jwt:Issuer"] ?? "MekanBudur";
            var audience = _config["Jwt:Audience"] ?? "MekanBudurUsers";

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(ClaimTypes.Role, user.Role.ToString()),
                new Claim("displayName", user.DisplayName ?? user.Email)
            };

            var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
            var creds = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
