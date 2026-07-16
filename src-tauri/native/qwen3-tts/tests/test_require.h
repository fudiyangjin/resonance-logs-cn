#pragma once

#include <cstdio>

#define REQUIRE(condition)                                                         \
    do {                                                                           \
        if (!(condition)) {                                                        \
            std::fprintf(stderr, "FAIL: %s (%s:%d)\n", #condition, __FILE__, __LINE__); \
            return 1;                                                              \
        }                                                                          \
    } while (false)
