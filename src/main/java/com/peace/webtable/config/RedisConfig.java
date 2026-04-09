package com.peace.webtable.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis 配置类
 *
 * 职责：配置 RedisTemplate 的序列化方式。
 * Key 使用 String 序列化，Value 使用 JSON 序列化，
 * 确保 Redis 中存储的数据可读且兼容不同客户端。
 */
@Configuration
public class RedisConfig {

    /**
     * 自定义 RedisTemplate Bean
     *
     * 解决默认 JdkSerializationRedisSerializer 导致的 Redis 数据不可读问题。
     * Key 用 StringRedisSerializer（可读性强），Value 用 JSON 序列化（支持复杂对象）。
     *
     * @param connectionFactory Redis 连接工厂
     * @return 配置好的 RedisTemplate 实例
     */
    @Bean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);

        // Key 使用 String 序列化，保证 Redis 中 key 可读
        StringRedisSerializer stringSerializer = new StringRedisSerializer();
        template.setKeySerializer(stringSerializer);
        template.setHashKeySerializer(stringSerializer);

        // Value 使用 JSON 序列化，支持存储复杂对象
        GenericJackson2JsonRedisSerializer jsonSerializer = new GenericJackson2JsonRedisSerializer();
        template.setValueSerializer(jsonSerializer);
        template.setHashValueSerializer(jsonSerializer);

        template.afterPropertiesSet();
        return template;
    }
}
