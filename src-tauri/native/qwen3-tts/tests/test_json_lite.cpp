#include "json_lite.h"
#include "test_require.h"

#include <cstdio>

using namespace qwen3_tts::json_lite;

int main() {
    printf("=== json_lite Test ===\n\n");

    printf("Test 1: parse a representative batch job document\n");
    {
        const std::string text = R"({
            "model_dir": "C:/models",
            "profile": {
                "mode": "existing",
                "existing_q3sp_path": "C:/voice/profiles/abc/speaker.q3sp"
            },
            "items": [
                {"id": "phrase_1", "text": "\u673a\u5236\u6765\u4e86", "language_id": 2055, "output_path": "C:/voice/staging/p1.wav", "temperature": 0.9},
                {"id": "phrase_2", "text": "buff ended", "language_id": 2050, "output_path": "C:/voice/staging/p2.wav"}
            ]
        })";

        Value root = parse(text);
        REQUIRE(root.is_object());
        REQUIRE(root.get_string("model_dir") == "C:/models");

        const Value * profile = root.find("profile");
        REQUIRE(profile && profile->is_object());
        REQUIRE(profile->get_string("mode") == "existing");

        const Value * items = root.find("items");
        REQUIRE(items && items->is_array());
        REQUIRE(items->as_array().size() == 2);
        const Value & item0 = items->as_array()[0];
        REQUIRE(item0.get_string("id") == "phrase_1");
        // \u673a\u5236\u6765\u4e86 == "机制来了"
        REQUIRE(item0.get_string("text") == "\xe6\x9c\xba\xe5\x88\xb6\xe6\x9d\xa5\xe4\xba\x86");
        REQUIRE(int(item0.get_number("language_id")) == 2055);
        REQUIRE(item0.get_number("temperature", -1.0) == 0.9);

        const Value & item1 = items->as_array()[1];
        // temperature omitted -> fallback is honored
        REQUIRE(item1.get_number("temperature", -1.0) == -1.0);
    }
    printf("  PASS\n\n");

    printf("Test 2: escape() round-trips control characters for JSONL output\n");
    {
        std::string escaped = escape("line1\nline2\t\"quoted\"\\path");
        std::string wrapped = "{\"msg\":\"" + escaped + "\"}";
        Value v = parse(wrapped);
        REQUIRE(v.get_string("msg") == "line1\nline2\t\"quoted\"\\path");
    }
    printf("  PASS\n\n");

    printf("Test 3: malformed JSON raises ParseError instead of crashing\n");
    {
        bool threw = false;
        try {
            parse("{ \"a\": }");
        } catch (const ParseError &) {
            threw = true;
        }
        REQUIRE(threw);
    }
    printf("  PASS\n\n");

    printf("Test 4: numbers, booleans and null\n");
    {
        Value v = parse(R"({"n": -12.5e2, "b": true, "z": null})");
        REQUIRE(v.get_number("n") == -1250.0);
        REQUIRE(v.get_bool("b") == true);
        const Value * z = v.find("z");
        REQUIRE(z && z->is_null());
    }
    printf("  PASS\n\n");

    printf("=== All json_lite tests passed! ===\n");
    return 0;
}
