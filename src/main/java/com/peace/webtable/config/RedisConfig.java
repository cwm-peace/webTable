package com.peace.webtable.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.StringRedisSerializer;

/**
 * Redis 配置类
 *
 * 职责：配置 RedisTemplate 的序列化方式。
 * Key 使用 String 序列化，Value 使用 Fastjson2 序列化，
 * 解决 Jackson 无法处理 Java 8 时间类型（LocalDateTime）的问题。
 */
@Configuration
public class RedisConfig {

    /**
     * 自定义 RedisTemplate Bean
     *
     * 使用 Fastjson2 替代 Jackson 做 Value 序列化，
     * 内置支持 LocalDateTime 等 Java 8 时间类型，无需额外模块。
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

        // Value 使用 Fastjson2 序列化，支持 Java 8 时间类型
        Fastjson2JsonRedisSerializer<Object> fastjsonSerializer = new Fastjson2JsonRedisSerializer<>();
        template.setValueSerializer(fastjsonSerializer);
        template.setHashValueSerializer(fastjsonSerializer);

        template.afterPropertiesSet();
        return template;
    }
}
