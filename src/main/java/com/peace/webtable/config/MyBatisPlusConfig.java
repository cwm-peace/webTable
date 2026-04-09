package com.peace.webtable.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MyBatis-Plus 配置类
 *
 * 职责：配置 MyBatis-Plus 插件，当前主要配置分页插件。
 * 分页插件自动为 SELECT 语句添加 LIMIT 分页支持，
 * 用于导出功能中的分批查询，避免一次性加载大量数据导致内存溢出。
 */
@Configuration
public class MyBatisPlusConfig {

    /**
     * 注册 MyBatis-Plus 拦截器
     *
     * 添加分页拦截器，指定数据库类型为 MySQL。
     * 使用时在 Mapper 方法中传入 Page 对象即可自动分页。
     *
     * @return MybatisPlusInterceptor 实例
     */
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        // MySQL 分页插件，指定 DbType 避免每次分页都去抓取数据库类型
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
