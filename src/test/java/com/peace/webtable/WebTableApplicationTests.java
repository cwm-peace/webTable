package com.peace.webtable;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 应用上下文启动测试。
 *
 * 使用测试专用强密码满足管理员启动校验，生产环境仍必须显式配置真实密码。
 */
@SpringBootTest(properties = "admin.password=Change-Me-2026-Strong")
class WebTableApplicationTests {

    /**
     * 验证 Spring Boot 应用上下文可以完整启动。
     */
    @Test
    void contextLoads() {
    }

}
