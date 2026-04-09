package com.peace.webtable;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 个人信息收集系统启动类
 *
 * 职责：Spring Boot 应用入口，启动嵌入式 Tomcat 服务器。
 * 通过 @MapperScan 扫描 mapper 包下的 MyBatis-Plus 接口，
 * 使其自动注册为 Spring Bean 供 Service 层注入使用。
 */
@SpringBootApplication
@MapperScan("com.peace.webtable.mapper")
public class WebTableApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebTableApplication.class, args);
    }
}
