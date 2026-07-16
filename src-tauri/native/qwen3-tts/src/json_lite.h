#pragma once

// json_lite: a small, dependency-free JSON reader used only to parse the
// sidecar's `--job <file>` batch descriptor and to emit JSONL progress
// lines. It intentionally supports only the subset of JSON needed for
// that purpose (objects, arrays, strings, numbers, booleans, null) and is
// not a general-purpose/standards-complete JSON library.

#include <cctype>
#include <cstdio>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace qwen3_tts {
namespace json_lite {

enum class value_type { null_type, boolean, number, string, array, object };

class Value {
public:
    Value() : type_(value_type::null_type) {}
    static Value make_null() { return Value(); }
    static Value make_bool(bool b) { Value v; v.type_ = value_type::boolean; v.bool_ = b; return v; }
    static Value make_number(double n) { Value v; v.type_ = value_type::number; v.num_ = n; return v; }
    static Value make_string(std::string s) { Value v; v.type_ = value_type::string; v.str_ = std::move(s); return v; }
    static Value make_array() { Value v; v.type_ = value_type::array; return v; }
    static Value make_object() { Value v; v.type_ = value_type::object; return v; }

    value_type type() const { return type_; }
    bool is_null() const { return type_ == value_type::null_type; }
    bool is_object() const { return type_ == value_type::object; }
    bool is_array() const { return type_ == value_type::array; }
    bool is_string() const { return type_ == value_type::string; }
    bool is_number() const { return type_ == value_type::number; }
    bool is_bool() const { return type_ == value_type::boolean; }

    const std::string & as_string() const { return str_; }
    double as_number() const { return num_; }
    bool as_bool() const { return bool_; }
    const std::vector<Value> & as_array() const { return arr_; }

    // Returns nullptr if this is not an object or the key is missing.
    const Value * find(const std::string & key) const {
        if (type_ != value_type::object) return nullptr;
        auto it = obj_.find(key);
        return it == obj_.end() ? nullptr : &it->second;
    }

    std::string get_string(const std::string & key, const std::string & fallback = "") const {
        const Value * v = find(key);
        return (v && v->is_string()) ? v->as_string() : fallback;
    }
    double get_number(const std::string & key, double fallback = 0.0) const {
        const Value * v = find(key);
        return (v && v->is_number()) ? v->as_number() : fallback;
    }
    bool get_bool(const std::string & key, bool fallback = false) const {
        const Value * v = find(key);
        return (v && v->is_bool()) ? v->as_bool() : fallback;
    }

    std::vector<Value> arr_;
    std::map<std::string, Value> obj_;

private:
    value_type type_;
    std::string str_;
    double num_ = 0.0;
    bool bool_ = false;
};

class ParseError : public std::runtime_error {
public:
    explicit ParseError(const std::string & msg) : std::runtime_error(msg) {}
};

namespace detail {

class Parser {
public:
    explicit Parser(const std::string & text) : s_(text), pos_(0) {}

    Value parse() {
        skip_ws();
        Value v = parse_value();
        skip_ws();
        if (pos_ != s_.size()) {
            throw ParseError("Trailing data after JSON value at offset " + std::to_string(pos_));
        }
        return v;
    }

private:
    const std::string & s_;
    size_t pos_;

    char peek() const {
        if (pos_ >= s_.size()) throw ParseError("Unexpected end of JSON input");
        return s_[pos_];
    }

    void skip_ws() {
        while (pos_ < s_.size() && (s_[pos_] == ' ' || s_[pos_] == '\t' || s_[pos_] == '\n' || s_[pos_] == '\r')) {
            ++pos_;
        }
    }

    void expect(char c) {
        if (peek() != c) {
            throw ParseError(std::string("Expected '") + c + "' at offset " + std::to_string(pos_));
        }
        ++pos_;
    }

    Value parse_value() {
        skip_ws();
        char c = peek();
        if (c == '{') return parse_object();
        if (c == '[') return parse_array();
        if (c == '"') return Value::make_string(parse_string());
        if (c == 't' || c == 'f') return parse_bool();
        if (c == 'n') return parse_null();
        return parse_number();
    }

    Value parse_object() {
        expect('{');
        Value v = Value::make_object();
        skip_ws();
        if (peek() == '}') { ++pos_; return v; }
        while (true) {
            skip_ws();
            std::string key = parse_string();
            skip_ws();
            expect(':');
            Value val = parse_value();
            v.obj_[key] = std::move(val);
            skip_ws();
            char c = peek();
            if (c == ',') { ++pos_; continue; }
            if (c == '}') { ++pos_; break; }
            throw ParseError("Expected ',' or '}' in object at offset " + std::to_string(pos_));
        }
        return v;
    }

    Value parse_array() {
        expect('[');
        Value v = Value::make_array();
        skip_ws();
        if (peek() == ']') { ++pos_; return v; }
        while (true) {
            Value val = parse_value();
            v.arr_.push_back(std::move(val));
            skip_ws();
            char c = peek();
            if (c == ',') { ++pos_; continue; }
            if (c == ']') { ++pos_; break; }
            throw ParseError("Expected ',' or ']' in array at offset " + std::to_string(pos_));
        }
        return v;
    }

    std::string parse_string() {
        expect('"');
        std::string out;
        while (true) {
            if (pos_ >= s_.size()) throw ParseError("Unterminated string literal");
            char c = s_[pos_++];
            if (c == '"') break;
            if (c == '\\') {
                if (pos_ >= s_.size()) throw ParseError("Unterminated escape sequence");
                char esc = s_[pos_++];
                switch (esc) {
                    case '"': out.push_back('"'); break;
                    case '\\': out.push_back('\\'); break;
                    case '/': out.push_back('/'); break;
                    case 'b': out.push_back('\b'); break;
                    case 'f': out.push_back('\f'); break;
                    case 'n': out.push_back('\n'); break;
                    case 'r': out.push_back('\r'); break;
                    case 't': out.push_back('\t'); break;
                    case 'u': {
                        if (pos_ + 4 > s_.size()) throw ParseError("Truncated \\u escape");
                        unsigned code = 0;
                        for (int i = 0; i < 4; ++i) {
                            char h = s_[pos_++];
                            code <<= 4;
                            if (h >= '0' && h <= '9') code |= (h - '0');
                            else if (h >= 'a' && h <= 'f') code |= (h - 'a' + 10);
                            else if (h >= 'A' && h <= 'F') code |= (h - 'A' + 10);
                            else throw ParseError("Invalid \\u escape");
                        }
                        // Basic BMP-only UTF-8 encoding (sufficient for our
                        // fixed-phrase and path payloads; surrogate pairs
                        // beyond U+FFFF are not needed here).
                        if (code < 0x80) {
                            out.push_back(char(code));
                        } else if (code < 0x800) {
                            out.push_back(char(0xC0 | (code >> 6)));
                            out.push_back(char(0x80 | (code & 0x3F)));
                        } else {
                            out.push_back(char(0xE0 | (code >> 12)));
                            out.push_back(char(0x80 | ((code >> 6) & 0x3F)));
                            out.push_back(char(0x80 | (code & 0x3F)));
                        }
                        break;
                    }
                    default:
                        throw ParseError("Invalid escape character in string");
                }
            } else {
                out.push_back(c);
            }
        }
        return out;
    }

    Value parse_bool() {
        if (s_.compare(pos_, 4, "true") == 0) { pos_ += 4; return Value::make_bool(true); }
        if (s_.compare(pos_, 5, "false") == 0) { pos_ += 5; return Value::make_bool(false); }
        throw ParseError("Invalid literal at offset " + std::to_string(pos_));
    }

    Value parse_null() {
        if (s_.compare(pos_, 4, "null") == 0) { pos_ += 4; return Value::make_null(); }
        throw ParseError("Invalid literal at offset " + std::to_string(pos_));
    }

    Value parse_number() {
        size_t start = pos_;
        if (peek() == '-') ++pos_;
        while (pos_ < s_.size() && isdigit(static_cast<unsigned char>(s_[pos_]))) ++pos_;
        if (pos_ < s_.size() && s_[pos_] == '.') {
            ++pos_;
            while (pos_ < s_.size() && isdigit(static_cast<unsigned char>(s_[pos_]))) ++pos_;
        }
        if (pos_ < s_.size() && (s_[pos_] == 'e' || s_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < s_.size() && (s_[pos_] == '+' || s_[pos_] == '-')) ++pos_;
            while (pos_ < s_.size() && isdigit(static_cast<unsigned char>(s_[pos_]))) ++pos_;
        }
        if (pos_ == start) throw ParseError("Invalid number at offset " + std::to_string(pos_));
        return Value::make_number(std::stod(s_.substr(start, pos_ - start)));
    }
};

} // namespace detail

// Throws ParseError on malformed input.
inline Value parse(const std::string & text) {
    detail::Parser parser(text);
    return parser.parse();
}

// Minimal string escaping for emitting JSONL progress/result lines.
inline std::string escape(const std::string & s) {
    std::string out;
    out.reserve(s.size() + 8);
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out.push_back(c);
                }
        }
    }
    return out;
}

} // namespace json_lite
} // namespace qwen3_tts
