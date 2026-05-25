package com.peace.webtable.config;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONReader;
import com.alibaba.fastjson2.JSONWriter;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.SerializationException;

/**
 * Fastjson2 Redis 序列化器
 *
 * 替代 GenericJackson2JsonRedisSerializer，解决 Jackson 无法序列化
 * Java 8 时间类型（LocalDateTime 等）的问题。
 * Fastjson2 内置支持 Java 8 时间类型，无需额外模块。
 */
public class Fastjson2JsonRedisSerializer<T> implements RedisSerializer<T> {

    @Override
    public byte[] serialize(T t) throws SerializationException {
        if (t == null) {
            return new byte[0];
        }
        return JSON.toJSONBytes(t, JSONWriter.Feature.WriteNulls);
    }

    @SuppressWarnings("unchecked")
    @Override
    public T deserialize(byte[] bytes) throws SerializationException {
        if (bytes == null || bytes.length == 0) {
            return null;
        }
        // 先尝试 Object.class 解析（新格式），失败则用 Map.class 兜底（兼容旧格式）
        try {
            Object result = JSON.parseObject(bytes, Object.class);
            if (result != null) {
                return (T) result;
            }
        } catch (Exception ignored) {
            // 新格式解析失败，尝试通用 Map/List 解析
        }
        return (T) JSON.parse(bytes);
    }
}
