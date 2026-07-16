#include "fs_util.h"

#include <cstdio>
#include <cstring>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
#include <cerrno>
#endif

namespace qwen3_tts {

bool atomic_replace_file(const std::string & tmp_path, const std::string & final_path, std::string & error_out) {
#ifdef _WIN32
    std::wstring wtmp(tmp_path.begin(), tmp_path.end());
    std::wstring wfinal(final_path.begin(), final_path.end());
    if (!MoveFileExW(wtmp.c_str(), wfinal.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        error_out = "Failed to atomically replace file (WinAPI error " + std::to_string(GetLastError()) + ")";
        return false;
    }
    return true;
#else
    if (std::rename(tmp_path.c_str(), final_path.c_str()) != 0) {
        error_out = "Failed to atomically replace file: " + std::string(strerror(errno));
        return false;
    }
    return true;
#endif
}

bool read_file_to_string(const std::string & path, std::string & out, std::string & error_out) {
    FILE * f = fopen(path.c_str(), "rb");
    if (!f) {
        error_out = "Cannot open file: " + path;
        return false;
    }

    out.clear();
    std::vector<char> chunk(1 << 16);
    size_t n;
    while ((n = fread(chunk.data(), 1, chunk.size(), f)) > 0) {
        out.append(chunk.data(), n);
    }
    bool ok = !ferror(f);
    fclose(f);

    if (!ok) {
        error_out = "I/O error reading file: " + path;
        return false;
    }
    return true;
}

} // namespace qwen3_tts
