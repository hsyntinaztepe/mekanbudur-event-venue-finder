@echo off
echo Stopping existing containers...
docker-compose down
echo.
echo Clearing Docker build cache...
docker builder prune -f
echo.
echo Starting Evently application with Hot Reload...
echo Note: This runs containers using the SDK image and mounts source code.
echo.
docker-compose -f docker-compose.yml -f docker-compose.watch.yml build --no-cache
docker-compose -f docker-compose.yml -f docker-compose.watch.yml up
pause
