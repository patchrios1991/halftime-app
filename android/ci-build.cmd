@echo off
rem Helper to run Gradle outside the Claude sandbox process tree (via WMI),
rem because Java NIO selectors fail with "Unable to establish loopback
rem connection" when spawned inside it. Usage: ci-build.cmd <gradle-task>
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
set "ANDROID_HOME=C:\Android\Sdk"
cd /d "%~dp0"
if exist "%~dp0ci-build-exit.txt" del "%~dp0ci-build-exit.txt"
call gradlew.bat %* > "%~dp0ci-build-log.txt" 2>&1
set "EC=%ERRORLEVEL%"
echo %EC% > "%~dp0ci-build-exit.txt"
