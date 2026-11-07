# 小屋木质家具图集

日期：2026-10-23。用于原创游戏《灵镜档案 · 林缘农场》的小屋固定布置。

通过内置 `image_gen.imagegen` 生成，首次生成八件暖木/鼠尾草绿/奶油白家具，再用同一工具做透明背景清理与轮廓强化。最终文件是第二次工具输出的原始PNG字节，没有用Python或其他图像工具改像素。原始生成与编辑提示词分别保存在 `home-furniture-prompt.txt`、`home-furniture-cleanup-prompt.txt`。

- 文件：`home-furniture-v1.png`，1536×1024，RGBA。
- SHA-256：`d1646cc8173c843e99eb3431d24344f98173a8d044ff1728873e34b984e283da`。
- alpha=0 的像素：968,004；读PNG进行测量，未修改源文件。
- 帧：table / chair / bookcase / sideboard / plant / lamp / rug / wall-shelf。
- JSON帧表按各独立物体alpha≥128的包围盒加2像素边距，未修改PNG像素；各矩形不相交。
- 游戏等比缩小显示，约22–112px宽；这是生成的像素风插画图集，不宣称原生16/32px像素资产。

没有使用商业游戏原图、第三方参考图或新下载素材；旧Cainos包及旧补件仍遵循各自来源记录。这里仅记录本新增图集来源，不为整个混合素材库新增统一授权。
