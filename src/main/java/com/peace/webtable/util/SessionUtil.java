package com.peace.webtable.util;

import java.util.UUID;

/**
 * 会话工具类
 *
 * 职责：生成和管理用户会话令牌。
 * 会话令牌是一个 UUID 字符串，用于标识一次完整的填写流程。
 * 前端首次访问时生成并存储在 sessionStorage 中，后续请求通过
 * X-Session-Token 请求头传递，后端通过此令牌在 Redis 中查找对应的 submissionId。
 */
public class SessionUtil {

    /**
     * 生成新的会话令牌
     *
     * 使用 UUID 去除连字符生成 32 位的随机字符串作为会话标识。
     * UUID v4 的随机性保证了令牌的唯一性和不可猜测性。
     *
     * @return 32 位的会话令牌字符串
     */
    public static String generateToken() {
        // 去除 UUID 中的连字符，得到 32 位纯字符串
        return UUID.randomUUID().toString().replace("-", "");
    }
}
