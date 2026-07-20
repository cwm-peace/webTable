package com.peace.webtable.util;

import com.google.gson.Gson;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Redis 操作工具类
 *
 * 职责：封装 Redis 常用操作，提供类型安全的 get/set/delete 方法。
 * 使用 Gson 进行 JSON 序列化/反序列化，确保缓存数据可读。
 *
 * 主要用于：
 * 1. 会话令牌到提交ID的映射缓存
 * 2. 步骤数据的读写穿透缓存
 * 3. 照片数据的短期缓存
 */
@Component
public class RedisUtil {

    private final RedisTemplate<String, Object> redisTemplate;
    private final Gson gson;

    public RedisUtil(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
        // Gson 实例复用，避免频繁创建
        this.gson = new Gson();
    }

    /**
     * 存储字符串值到 Redis
     *
     * @param key   Redis 键
     * @param value 存储的值
     * @param timeout 过期时间
     * @param unit  时间单位
     */
    public void set(String key, Object value, long timeout, TimeUnit unit) {
        redisTemplate.opsForValue().set(key, value, timeout, unit);
    }

    /**
     * 存储字符串值到 Redis（无过期时间）
     *
     * @param key   Redis 键
     * @param value 存储的值
     */
    public void set(String key, Object value) {
        redisTemplate.opsForValue().set(key, value);
    }

    /**
     * 从 Redis 获取值
     *
     * @param key Redis 键
     * @return 存储的值，不存在时返回 null
     */
    public Object get(String key) {
        return redisTemplate.opsForValue().get(key);
    }

    /**
     * 原子递增 Redis 数值。
     *
     * 用于登录失败次数等计数场景，避免并发请求下读写覆盖。
     *
     * @param key Redis 键
     * @return 递增后的值
     */
    public Long increment(String key) {
        return redisTemplate.opsForValue().increment(key);
    }

    /**
     * 从 Redis 获取值并转换为指定类型
     *
     * 通过 Gson 将 Redis 中的 JSON 字符串反序列化为目标类型。
     *
     * @param key  Redis 键
     * @param clazz 目标类型
     * @param <T>   泛型类型
     * @return 转换后的对象，不存在时返回 null
     */
    @SuppressWarnings("unchecked")
    public <T> T get(String key, Class<T> clazz) {
        Object value = redisTemplate.opsForValue().get(key);
        if (value == null) {
            return null;
        }
        // 如果已经是目标类型则直接返回，避免不必要的序列化
        if (clazz.isInstance(value)) {
            return (T) value;
        }
        // 通过 Gson 将 JSON 字符串转换为目标对象
        return gson.fromJson(gson.toJson(value), clazz);
    }

    /**
     * 删除 Redis 中的键
     *
     * @param key Redis 键
     * @return 是否删除成功
     */
    public Boolean delete(String key) {
        return redisTemplate.delete(key);
    }

    /**
     * 判断 Redis 中是否存在某个键
     *
     * @param key Redis 键
     * @return 是否存在
     */
    public Boolean hasKey(String key) {
        return redisTemplate.hasKey(key);
    }

    /**
     * 设置键的过期时间
     *
     * @param key     Redis 键
     * @param timeout 过期时间
     * @param unit    时间单位
     * @return 是否设置成功
     */
    public Boolean expire(String key, long timeout, TimeUnit unit) {
        return redisTemplate.expire(key, timeout, unit);
    }
}
