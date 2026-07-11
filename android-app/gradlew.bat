@echo off
setlocal
set GRADLE_VERSION=9.4.1
set CACHE_ROOT=%USERPROFILE%\.gradle\bibliotech-wrapper
set GRADLE_HOME=%CACHE_ROOT%\gradle-%GRADLE_VERSION%
set ARCHIVE=%CACHE_ROOT%\gradle-%GRADLE_VERSION%-bin.zip

if not exist "%GRADLE_HOME%\bin\gradle.bat" (
  if not exist "%CACHE_ROOT%" mkdir "%CACHE_ROOT%"
  if not exist "%ARCHIVE%" (
    echo Downloading Gradle %GRADLE_VERSION%...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip' -OutFile '%ARCHIVE%'"
    if errorlevel 1 exit /b 1
  )
  powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '%GRADLE_HOME%') { Remove-Item -Recurse -Force '%GRADLE_HOME%' }; Expand-Archive -Force '%ARCHIVE%' '%CACHE_ROOT%'"
  if errorlevel 1 exit /b 1
)

call "%GRADLE_HOME%\bin\gradle.bat" %*
endlocal
