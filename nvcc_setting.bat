@echo off
rem Run with CALL from the CMD session used to launch Cargo.
set "NVCC_VS_ROOT="
for /f "usebackq delims=" %%I in (`"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "NVCC_VS_ROOT=%%I"
if not defined NVCC_VS_ROOT (
    echo ERROR: MSVC C++ build tools were not found.
    exit /b 1
)
call "%NVCC_VS_ROOT%\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
set "NVCC_VS_ROOT="
set "CCCL_ROOT=D:\msys64\home\NekoYama\dps_star\cccl\cccl"
where cl.exe
if errorlevel 1 exit /b 1


