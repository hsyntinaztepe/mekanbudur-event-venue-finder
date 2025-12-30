@echo off
echo DIKKAT: Bu islem veritabanini SIFIRLAYACAK ve tum verileri silecektir.
echo Kategorilerin Turkce olarak gelmesi icin bu islem gereklidir.
echo.
pause
echo.
echo Konteynerler, volumeler ve cache siliniyor...
docker-compose down -v
docker builder prune -af
echo.
echo Uygulama yeniden baslatiliyor...
call docker-start.bat
