import zhLiteral from "../zh-CN/literal";

const literal = Object.fromEntries(
  Object.keys(zhLiteral).map((key) => [key, key]),
) as Record<string, string>;

export default literal;
