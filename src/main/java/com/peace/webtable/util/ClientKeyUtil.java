package com.peace.webtable.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * 客户端标识工具类。
 *
 * 职责：将客户端地址等标识归一化并哈希，用于 Redis 限流 key 和日志，避免直接暴露原始地址。
 */
public final class ClientKeyUtil {

    private ClientKeyUtil() {
    }

    /**
     * 将客户端标识转换为稳定哈希 key。
     *
     * @param clientIdentifier 客户端标识，通常为远端地址
     * @return SHA-256 十六进制摘要
     */
    public static String hashClientIdentifier(String clientIdentifier) {
        String normalized = clientIdentifier != null && !clientIdentifier.isBlank()
                ? clientIdentifier.trim()
                : "unknown";
        return HexFormat.of().formatHex(sha256Bytes(normalized));
    }

    /**
     * 计算 SHA-256 摘要。
     */
    private static byte[] sha256Bytes(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return digest.digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 算法不可用", e);
        }
    }
}
