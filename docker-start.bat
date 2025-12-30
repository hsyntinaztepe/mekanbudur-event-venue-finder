@echo off
echo Starting Evently application with Docker...
echo.
echo Clearing Docker build cache...
docker builder prune -f
echo.
echo Building and starting containers...
docker-compose build --no-cache
docker-compose up -d
echo.
echo Application started!
echo API is running at http://localhost:8081
echo Web is running at http://localhost:8080
echo Geo Service is running at http://localhost:8082
echo PgAdmin is running at http://localhost:5050
echo.
pause
