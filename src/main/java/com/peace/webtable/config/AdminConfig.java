package com.peace.webtable.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

/**
 * 管理员配置类
 *
 * 职责：读取管理员相关配置项（密码等）。
 * 管理员密码配置在 application.yml 的 admin.password 字段中。
 */
@Configuration
public class AdminConfig {

    /** 管理员登录密码，从 application.yml 读取 */
    @Value("${admin.password}")
    private String password;

    /**
     * 获取管理员密码
     *
     * @return 管理员密码
     */
    public String getPassword() {
        return password;
    }
}
