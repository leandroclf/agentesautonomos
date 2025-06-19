@echo off

echo "--- Debugging start.bat ---"

echo "USERPROFILE: %USERPROFILE%"
set NVM_HOME=%USERPROFILE%\AppData\Roaming\nvm
set NVM_SYMLINK=%USERPROFILE%\AppData\Roaming\nvm
echo "NVM_HOME: %NVM_HOME%"
echo "NVM_SYMLINK: %NVM_SYMLINK%"

echo "Original PATH: %PATH%"
set PATH=%NVM_HOME%;%NVM_SYMLINK%;%PATH%
echo "Modified PATH: %PATH%"

echo "--- Running nvm list ---"
call nvm list

echo "--- Running nvm use ---"
call nvm use
echo "--- nvm use finished ---"

echo "--- Checking node version ---"
call node -v
echo "--- node version check finished ---"

echo "--- Running application ---"
call node dev\scripts\start-all.js
echo "--- Application finished ---"